"""Retain all attempts and publish measured counts; never call a model or pay."""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--evidence-root", type=Path, default=ROOT / "outputs/real-projects-2026-11-05")
args = parser.parse_args()
evidence = args.evidence_root.resolve()
public = ROOT / "public/benchmarks/real-projects-2026-11-05"
public.mkdir(parents=True, exist_ok=True)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def load(name):
    return json.loads((evidence / name).read_text())

def save(name, value):
    (public / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")

names = ["baseline", "supplemental-baseline", "known", "known-supplemental", "long", "holdout",
         "final-known", "final-supplemental", "final-long", "final-holdout", "strict-holdout", "release-holdout",
         "verified-known", "verified-supplemental", "verified-long", "verified-holdout",
         "headroom-known", "headroom-supplemental", "headroom-long", "headroom-holdout",
         "semantic-final-known", "semantic-final-supplemental", "semantic-final-long", "semantic-final-holdout",
         "evidence-final-known", "evidence-final-supplemental", "evidence-final-long", "evidence-final-holdout"]
reports = {name: load(name + "-live.json") for name in names}
for report in reports.values():
    assert report["mode"] == "live" and report["schema"] == "proofbeforepay-project-evaluation-report-v1"
    assert report["accounting"]["calls"] == sum(bool(r["networkAttempted"]) for r in report["results"])

def counts(rows):
    criteria = [c for r in rows for c in r["criteria"]]
    return dict(projects=len(rows), criteria=len(criteria),
                rawAgreement=sum(c["rawStatus"] == c["referenceStatus"] for c in criteria),
                applicationAgreement=sum(c["applicationStatus"] == c["referenceStatus"] for c in criteria),
                completeItemProjects=sum(bool(r.get("rawDiagnostics", {}).get("completeItemCoverage")) and
                                         r["rawDiagnostics"]["finishReason"] in ["stop", "tool_calls"] for r in rows),
                admittedReports=sum(bool(r.get("application", {}).get("accepted")) for r in rows))

novel_development = [r for r in reports["baseline"]["results"] if r["id"] != "real-business-casual"]
historical = [r for r in reports["baseline"]["results"] if r["id"] == "real-business-casual"]
first_novel = novel_development + reports["supplemental-baseline"]["results"] + reports["holdout"]["results"]
known_final = reports["evidence-final-known"]["results"] + reports["evidence-final-supplemental"]["results"]
final_rows = known_final + reports["evidence-final-long"]["results"] + reports["evidence-final-holdout"]["results"]
assert len(final_rows) == 7, "The final cohort must retain all attempted reports, including rejections."
assert all(r["raw"]["transport"] == "strict_tool" for r in final_rows)

# Freeze identity is explicit; these text archives are assembled after calls,
# each source byte checked against the hash that existed before provider I/O.
for target, report_name, source_root in [
    ("baseline-implementation.json", "baseline", evidence / "baseline-source"),
]:
    rows = []
    for entry in reports[report_name]["snapshot"]["implementation"]:
        path = (source_root / entry["file"]).resolve()
        assert path.is_relative_to(source_root.resolve())
        data = path.read_bytes()
        assert sha(data) == entry["sha256"], entry["file"]
        rows.append({**entry, "sourceUtf8": data.decode("utf-8")})
    save(target, {"schema": "pbp-exact-implementation-text-v1", "implementation": rows,
                  "provenance": "Assembled after calls from bytes matching every pre-call frozen source hash; not a pre-call complete archive."})
r8_archive = load("r8-implementation.json")
r8_expected = reports["evidence-final-holdout"]["snapshot"]["implementation"]
assert [{"file": row["file"], "sha256": row["sha256"]} for row in r8_archive["implementation"]] == r8_expected
assert all(sha(row["sourceUtf8"].encode()) == row["sha256"] for row in r8_archive["implementation"])
save("verified-implementation.json", r8_archive)

artifacts = []
for name in names:
    for suffix in ["-live.json", "-freeze.json"]:
        file = name + suffix
        shutil.copyfile(evidence / file, public / file)
        artifacts.append(file)
for file in ["r3-implementation.json", "r5-implementation.json", "pre-budget-implementation.json", "pre-punctuation-implementation.json", "controlled-replay.json",
             "controlled-replay-supplemental-final.json", "controlled-replay-strict-null.json",
             "cycle-4-final-long-replay.json", "baseline-independent-source-review.json",
             "supplemental-independent-source-review.json", "r3-independent-whole-review.json",
             "pre-evidence-implementation.json", "pre-evidence-independent-whole-review.json",
             "r9-controlled-replay.json", "r9-controlled-guard-summary.json", "r9-current-freeze.json", "r9-implementation.json"]:
    shutil.copyfile(evidence / file, public / file)
    artifacts.append(file)
shutil.copyfile(evidence / "evidence-final-independent-whole-review.json", public / "final-independent-whole-review.json")
artifacts.append("final-independent-whole-review.json")
for source, destination in [
    ("real-project-assessment-corpus-2026-11-05.json", "development-corpus.json"),
    ("real-project-assessment-supplemental-corpus-2026-11-05.json", "supplemental-corpus.json"),
    ("real-project-holdout-corpus-2026-11-05.json", "holdout-corpus.json"),
    ("real-project-long-checklist-corpus-2026-11-05.json", "long-corpus.json"),
    ("real-project-assessment-provenance-2026-11-05.json", "development-provenance.json"),
    ("real-project-assessment-supplemental-provenance-2026-11-05.json", "supplemental-provenance.json"),
    ("real-project-holdout-provenance-2026-11-05.json", "holdout-provenance.json"),
    ("real-project-assessment-exposure-audit-2026-11-05.json", "exposure-audit.json"),
]:
    shutil.copyfile(ROOT / "scripts" / source, public / destination)
    artifacts.append(destination)

null_annotations = 0
syntax_normalizations = 0
for row in final_rows:
    syntax_normalizations += row["raw"].get("contentNormalization") == "one_trailing_brace"
    for risk in row["raw"].get("risks") or []:
        for key, value in risk.items():
            if key not in ["title", "explanation", "suggestion", "citations"]:
                assert value is None
                null_annotations += 1

summary = dict(
    schema="pbp-real-project-validation-v1", phase="measured-including-rejected-reports", date="2026-11-05",
    model="deepseek-flash", novelFirst=counts(first_novel), historicalFirst=counts(historical),
    latestModelStage="cycle-8-before-final-negative-guard", latestModelCounts=counts(final_rows),
    postModelGuard=load("r9-controlled-guard-summary.json"),
    knownFinal=counts(known_final), heldoutFirst=counts(reports["holdout"]["results"]),
    heldoutKnownFinal=counts(reports["evidence-final-holdout"]["results"]),
    longFirst=counts(reports["long"]["results"]), longFinal=counts(reports["evidence-final-long"]["results"]),
    finalStatusDistribution=dict(Counter(c["applicationStatus"] for r in final_rows for c in r["criteria"])),
    assessmentCalls=sum(r["accounting"]["calls"] for r in reports.values()),
    usageDerivedPeakCostEstimateUsd=sum(r["accounting"]["reportedUsageCostUsd"] for r in reports.values()),
    unknownUsageReservedUsd=sum(r["accounting"]["unknownUsageReservedUsd"] for r in reports.values()),
    finalTransport=dict(strictReports=len(final_rows), ignoredNullRiskFields=null_annotations,
                        syntaxNormalizedReports=syntax_normalizations),
    wholeAnswerReview=load("evidence-final-independent-whole-review.json")["summary"],
    humanSessions=0, externalSellerAdoption="not-newly-observed", automaticRetries=0, newPayments=0,
    historicalCorrection="Business Casual already existed in tracked baseline history. It remains in original calls but is excluded from novelFirst; corrected provenance and original metadata audit retained.",
    disputedReferences=[
        {"project": "real-personal-supplemental", "criterion": "coverage-1", "reason": "Broad page copy, omitted JS; conservative unknown is defensible. Original reference and strict scores unchanged."},
        {"project": "real-modern-business", "criterion": "manual-5", "reason": "Exact page question vs omitted dynamic alternatives; source-only ambiguity retained, not force-scored as a fix."},
        {"project": "real-modern-business", "criterion": "coverage-1", "reason": "Reference rationale said mailto; real href is #!. Text-presence label remains supported; no navigation/mail delivery proved."},
    ],
    limits=[
        "Five previously unrecorded repositories include the two held-out repositories; they must not be added together. Several are related StartBootstrap templates, not five independent authors or customers.",
        "Unmodified MIT HTML/CSS subsets plus newly authored research requirements, not original client contracts or customer deployments. Omitted JS/CSS/pixels/backend were not executed.",
        "First cohorts used different retained implementation freezes. Known regressions and the longer Corona task add no new repository.",
        "Raw item states, complete IDs, complete report admission, exact quotations, full semantic support and buyer acceptance are separate. First failures remain included.",
        "Strict Beta requested a closed schema but real responses still included null extras or an orphan brace. Local bounded normalization is explicitly marked and does not invent required values; no API strict-compliance guarantee.",
        "Raw provider envelopes and originalContentText are retained. When a single orphan brace was normalized, canonicalText and originalJsonValid/contentNormalization identify this; no original failed score is rewritten.",
        "AI whole-answer reviews are not human usability studies. Status agreement does not imply fully supported explanations, no hidden bugs, runtime correctness or superiority over an award winner.",
        "No new browser/backend execution for these corpus assessments, external seller adoption, human sessions, acceptance, payment, Devpost or video outcome.",
        "Cost is usage-derived at conservative peak rates, not an invoice. Harness source-review usage is separate from assessmentCalls.",
    ],
    artifacts=["README.md", "manifest.json", "baseline-implementation.json", "verified-implementation.json"] + artifacts,
)
save("summary.json", summary)
(public / "README.md").write_text(
    "# Real open-source source-assessment validation, 2026-11-05\n\n"
    + "Five new-to-tracked-history repositories / 40 first-attempt criteria; two held-out repositories are a subset. One historically seen repository and a new sixteen-item task on the known Corona source are separate. All tasks are authored research requirements, not customer contracts.\n\n"
    + "First attempts and every later batch retain their original scores and provider envelopes. See summary.json for exact raw/application counts, structure admission and disagreements. The final known regressions are not new unseen accuracy.\n\n"
    + "The final independent AI whole-answer source review is separately downloadable, with measured counts in summary.json; the earlier 43-call/pre-evidence review is retained separately. Matching statuses do not imply complete multi-fact citation witnesses or clear dynamic-copy scope. It is not a human or newly blinded review. Original JSON validity and explicitly marked single-trailing-brace normalization are recorded separately.\n\n"
    + "Every imported source file retains exact commit/raw URL/SHA/length and its MIT licence in source-provenance. No third-party code, browser, backend or payment was executed by these model evaluations.\n\n"
    + "Strict-tool arguments remain untrusted data. Locally accepted compatibility is bounded to at most two null annotation fields per complete risk and exactly one orphan final brace after a complete strict JSON object. Each normalization is marked; mandatory missing values are never supplied, and source/coverage/size checks remain. API strict enforcement itself was observed to be imperfect.\n\n"
    + "Implementation text archives were assembled after calls by checking every byte against original pre-call freeze hashes. They are not claimed to be complete backups created before the calls.\n\n"
    + "Rebuild measured summaries with python3 scripts/build-real-project-validation-summary-2026-11-05.py --evidence-root <directory containing retained batch JSON and implementation sources>. Full original reviewer discussion remains in the local collaboration evidence; docs/collaboration/real-projects-2026-11-05 records accepted/rejected findings.\n"
)
manifest = []
for file in sorted(public.rglob("*")):
    if file.is_file() and file.name != "manifest.json":
        data = file.read_bytes()
        manifest.append(dict(file=file.relative_to(public).as_posix(), bytes=len(data), sha256=sha(data)))
save("manifest.json", dict(schema="pbp-real-project-artifacts-v1", files=manifest))
print(json.dumps({k: summary[k] for k in ["novelFirst", "historicalFirst", "knownFinal", "heldoutKnownFinal", "longFinal", "assessmentCalls", "finalTransport"]}))
