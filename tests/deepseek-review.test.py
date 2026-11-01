"""Meaningful failure-boundary checks; no model or real Harness is invoked."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "deepseek-review.py"
spec = importlib.util.spec_from_file_location("deepseek_review", SCRIPT)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


def valid_report(file="lib/example.ts", line=2):
    return {"summary": "A concrete defect was found.", "findings": [{"severity": "P2", "file": file,
        "line": line, "title": "Boundary error", "evidence": "The supplied line accepts zero.",
        "reproduction": "Unexecuted trace: passing zero enters the invalid branch.",
        "suggestion": "Reject zero before the branch."}], "limitations": ["Static source review only."]}


class PacketBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name).resolve()
        self.repo = self.base / "repo"
        (self.repo / "lib").mkdir(parents=True)
        (self.repo / "lib/example.ts").write_text("export const x = 0;\nconsole.log(x);\n")

    def tearDown(self):
        self.temp.cleanup()

    def test_explicit_sources_have_content_hash_and_line_numbers(self):
        packet = review.load_packet(self.repo, ["lib/example.ts", "lib/example.ts"], [])
        self.assertEqual(len(packet), 1)
        self.assertEqual(packet[0]["lines"], 2)
        self.assertEqual(len(packet[0]["sha256"]), 64)
        self.assertNotIn("text", review.packet_metadata(packet)[0])

    def test_sensitive_output_and_unallowlisted_paths_rejected_before_read(self):
        paths = [".env", ".dev.vars", "lib/auth.json", "lib/credential.txt", "lib/output/a.ts",
                 "outputs/report.json", ".git/config", "package.json", "../outside.ts"]
        with patch.object(Path, "open", side_effect=AssertionError("no read allowed")):
            for path in paths:
                with self.subTest(path=path), self.assertRaises(review.ReviewError):
                    review.load_packet(self.repo, [path], [])

    def test_symlink_file_and_parent_are_rejected(self):
        outside = self.base / "outside.ts"
        outside.write_text("private")
        (self.repo / "lib/link.ts").symlink_to(outside)
        (self.repo / "app").symlink_to(outside.parent, target_is_directory=True)
        for path in ["lib/link.ts", "app/outside.ts"]:
            with self.subTest(path=path), self.assertRaisesRegex(review.ReviewError, "symlink"):
                review.load_packet(self.repo, [path], [])

    def test_absolute_path_must_stay_in_repo(self):
        with self.assertRaisesRegex(review.ReviewError, "outside"):
            review.load_packet(self.repo, [str(self.base / "outside.ts")], [])

    def test_per_file_and_aggregate_size_limits(self):
        (self.repo / "lib/large.ts").write_bytes(b"x" * (review.FILE_LIMIT + 1))
        with self.assertRaisesRegex(review.ReviewError, "file_size"):
            review.load_packet(self.repo, ["lib/large.ts"], [])
        for name in ("a", "b", "c"):
            (self.repo / f"lib/{name}.ts").write_bytes(b"x" * (90 * 1024))
        with self.assertRaisesRegex(review.ReviewError, "packet_size"):
            review.load_packet(self.repo, [f"lib/{name}.ts" for name in ("a", "b", "c")], [])

    def test_binary_and_secret_like_source_are_rejected(self):
        for data in (b"binary\x00data", b"\xff\xfe", b"Authorization: Bearer abcdefghijklmnop"):
            (self.repo / "lib/bad.ts").write_bytes(data)
            with self.subTest(data=data), self.assertRaises(review.ReviewError):
                review.load_packet(self.repo, ["lib/bad.ts"], [])

    def test_skill_requires_explicit_name_and_uses_project_document(self):
        skill = self.repo / ".agents/skills/review-flow/SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text("---\nname: review-flow\ndescription: review\n---\nRead carefully.\n")
        with self.assertRaisesRegex(review.ReviewError, "explicitly_selected"):
            review.load_packet(self.repo, [".agents/skills/review-flow/SKILL.md"], [])
        packet = review.load_packet(self.repo, ["lib/example.ts"], ["review-flow"])
        self.assertEqual(packet[1]["file"], ".agents/skills/review-flow/SKILL.md")

    def test_dry_run_never_starts_harness_or_copies_text(self):
        output = self.base / "dry.json"
        with patch.object(review.subprocess, "Popen", side_effect=AssertionError("must not launch")), \
             contextlib.redirect_stdout(io.StringIO()):
            code = review.main(["--repo", str(self.repo), "--file", "lib/example.ts", "--task", "review",
                                "--output", str(output), "--harness", "/not/installed", "--dry-run"])
        self.assertEqual(code, 0)
        data = json.loads(output.read_text())
        self.assertTrue(data["packetValid"])
        self.assertFalse(data["completed"])
        self.assertNotIn("export const", output.read_text())

    def test_output_cannot_overwrite_or_follow_symlinks(self):
        original = self.base / "existing.json"
        original.write_text("original")
        link = self.base / "link.json"
        link.symlink_to(original)
        for path in (original, link):
            with self.assertRaises(review.ReviewError):
                review.write_result(path, {})
        self.assertEqual(original.read_text(), "original")


class ReportValidationTests(unittest.TestCase):
    packet = [{"file": "lib/example.ts", "lines": 2}]

    def test_valid_report_and_empty_findings(self):
        self.assertEqual(review.validate_report(json.dumps(valid_report()), self.packet)["findings"][0]["line"], 2)
        report = valid_report()
        report["findings"] = []
        review.validate_report(json.dumps(report), self.packet)

    def test_fabricated_file_line_or_severity_fails(self):
        for key, value in [("file", "lib/not-supplied.ts"), ("line", 3), ("line", True), ("severity", "P0"), ("severity", [])]:
            report = valid_report()
            report["findings"][0][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(review.ReviewError):
                review.validate_report(json.dumps(report), self.packet)

    def test_markdown_unstructured_and_sensitive_output_fail(self):
        for text in ("Looks good", "```json\n{}\n```", '{"summary":"Bearer abcdefghijklmnop"}'):
            with self.subTest(text=text), self.assertRaises(review.ReviewError):
                review.validate_report(text, self.packet)


class SkillEvidenceTests(unittest.TestCase):
    def tracker(self):
        tracker = review.ReviewTracker(["review-flow"], {"review-flow": {
            "directory": "/repo/.agents/skills/review-flow", "body": "review instructions"}})
        tracker.consume({"type": "user/message", "data": {"source": {"kind": "skill-catalog", "entries": [
            {"name": "review-flow", "description": "private runtime text must never be retained"},
            {"name": "unrelated-private-skill"}]}}})
        return tracker

    def call(self, tracker, name="skill", skill="review-flow"):
        tracker.consume({"type": "tool/call", "data": {"callId": "call-1", "name": name, "arguments": {"name": skill}}})

    def result(self, tracker, error=False, directory="/repo/.agents/skills/review-flow", body="review instructions"):
        tracker.consume({"type": "tool/result", "data": {"message": {"source": {"callId": "call-1"},
            "isError": error, "content": [{"type": "text", "text":
                '<skill_content name="review-flow">\n<skill_resources>\nBase directory for this skill: ' + directory +
                '\n</skill_resources>\n\n<skill_instructions>\n' + body + '\n</skill_instructions>\n</skill_content>'}]}}})

    def test_catalog_and_real_successful_load_are_required(self):
        tracker = self.tracker()
        self.call(tracker)
        self.result(tracker)
        tracker.final_text = json.dumps(valid_report())
        tracker.turn_completed = tracker.wait_returned = True
        tracker.finish()
        self.assertEqual(tracker.errors, [])
        self.assertEqual(tracker.loaded, {"review-flow"})
        self.assertNotIn("secret runtime", json.dumps(tracker.tool_metadata))
        self.assertNotIn("unrelated-private-skill", str(tracker.catalog))

    def test_claim_of_loading_does_not_count(self):
        tracker = self.tracker()
        tracker.final_text = "I loaded the skill."
        tracker.turn_completed = tracker.wait_returned = True
        tracker.finish()
        self.assertIn("required_skill_not_loaded", tracker.errors)

    def test_unallowed_tools_and_ptc_fail(self):
        for name in ("bash", "read", "write", "run_code"):
            tracker = self.tracker()
            self.call(tracker, name=name)
            self.assertIn("unallowed_tool_call", tracker.errors)
        tracker = self.tracker()
        tracker.consume({"type": "tool/ptc-dispatch", "data": {"name": "skill"}})
        self.assertIn("unallowed_tool_event", tracker.errors)

    def test_wrong_skill_and_error_result_cannot_pass(self):
        tracker = self.tracker()
        self.call(tracker, skill="other-skill")
        self.assertIn("unallowed_tool_call", tracker.errors)
        tracker = self.tracker()
        self.call(tracker)
        self.result(tracker, error=True)
        tracker.finish()
        self.assertIn("skill_load_failed", tracker.errors)
        self.assertIn("required_skill_not_loaded", tracker.errors)

    def test_same_named_shadow_or_changed_skill_body_fails(self):
        for directory, body in [("/repo/.dsh/skills/review-flow", "review instructions"),
                                ("/repo/.agents/skills/review-flow", "different instructions")]:
            tracker = self.tracker()
            self.call(tracker)
            self.result(tracker, directory=directory, body=body)
            tracker.finish()
            self.assertIn("skill_loaded_source_mismatch", tracker.errors)
            self.assertNotIn("review-flow", tracker.loaded)

    def test_expected_body_uses_documented_harness_frontmatter_and_trim(self):
        packet = [{"file": ".agents/skills/review-flow/SKILL.md", "text":
                   "---\nname: review-flow\ndescription: review\n---\n\nreview instructions\n\ufeff"}]
        expected = review.expected_skill_documents(Path("/repo"), packet, ["review-flow"])
        self.assertEqual(expected["review-flow"]["body"], "review instructions")

    def test_max_tokens_and_missing_wait_are_incomplete(self):
        tracker = review.ReviewTracker([])
        tracker.consume({"type": "turn/end", "data": {"reason": {"kind": "max-tokens"}}})
        tracker.finish()
        self.assertIn("turn_not_completed", tracker.errors)
        self.assertIn("wait_not_returned", tracker.errors)

    def test_empty_last_assistant_message_cannot_reuse_prior_report(self):
        tracker = review.ReviewTracker([])
        tracker.final_text = json.dumps(valid_report())
        tracker.consume({"type": "assistant/message", "data": {"message": {"content": []}}})
        self.assertEqual(tracker.final_text, "")
        tracker.finish()
        self.assertIn("missing_final_assistant_text", tracker.errors)

    def test_prompt_labels_actual_source_lines(self):
        packet = [{"file": "lib/a.ts", "bytes": 3, "lines": 2, "sha256": "a" * 64, "text": "a\nb"}]
        prompt = review.review_prompt("review", packet, [])
        self.assertIn('1: a\\n2: b', prompt)


class LifecycleTests(unittest.TestCase):
    def test_cleanup_catches_final_wait_failure_and_signal_races(self):
        process = unittest.mock.Mock()
        process.poll.return_value = None
        process.wait.side_effect = subprocess.TimeoutExpired("fake", 1)
        process.terminate.side_effect = ProcessLookupError()
        process.kill.side_effect = ProcessLookupError()
        tracker = review.ReviewTracker([])
        review.stop_process(process, lambda *_: None, tracker)
        self.assertIn("cleanup_incomplete", tracker.errors)
        self.assertEqual(process.wait.call_count, 3)
        process.terminate.assert_called_once()
        process.kill.assert_called_once()

    def run_fake(self, rpc_error=False):
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary).resolve()
            fake = repo / "fake-harness"
            report = json.dumps(valid_report())
            fake.write_text(f'''#!{sys.executable}
import json, sys
def emit(value):
    print(json.dumps(value), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    identifier = request['id']
    method = request['method']
    if method == 'initialize':
        if {rpc_error!r}:
            emit({{'jsonrpc':'2.0','id':identifier,'error':{{'message':'PRIVATE RUNTIME DATA','headers':{{'Authorization':'Bearer abcdefghijklmnop'}}}}}})
            continue
        emit({{'jsonrpc':'2.0','id':identifier,'result':{{'serverInfo':{{'name':'fake'}}}}}})
    elif method == 'session/prompt':
        session = request['params']['sessionId']
        emit({{'jsonrpc':'2.0','id':identifier,'result':{{}}}})
        for kind,data in [('assistant/message',{{'message':{{'content':[{{'type':'reasoning','text':'PRIVATE REASONING'}},{{'type':'text','text':{report!r}}}]}}}}),('turn/end',{{'reason':{{'kind':'completed'}}}})]:
            emit({{'jsonrpc':'2.0','method':'session.event','params':{{'sessionId':session,'event':{{'type':kind,'data':data}}}}}})
    elif method == 'session/wait':
        emit({{'jsonrpc':'2.0','id':identifier,'result':{{}}}})
    elif method == 'shutdown':
        emit({{'jsonrpc':'2.0','id':identifier,'result':{{}}}})
        break
''')
            fake.chmod(0o700)
            packet = [{"file": "lib/example.ts", "lines": 2, "bytes": 3, "sha256": "0" * 64, "text": "a\nb"}]
            return review.run_review(repo, packet, [], "review", str(fake), 10)

    def test_end_to_end_protocol_validates_report_without_reasoning(self):
        result = self.run_fake()
        self.assertTrue(result["completed"], result["errors"])
        self.assertTrue(result["waitReturned"])
        self.assertNotIn("PRIVATE REASONING", json.dumps(result))

    def test_rpc_error_is_generic_and_never_copies_headers(self):
        result = self.run_fake(rpc_error=True)
        self.assertFalse(result["completed"])
        self.assertIn("sdk_rpc_error", result["errors"])
        self.assertNotIn("PRIVATE RUNTIME", json.dumps(result))
        self.assertNotIn("Authorization", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
