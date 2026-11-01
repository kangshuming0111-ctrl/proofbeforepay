# Bounded DeepSeek source review

`deepseek-review.py` sends explicitly selected repository source to the locally
installed **DeepSeek Harness `sdk` profile**. It uses the Harness's existing login;
this client does not open credential files or require an API key. Python 3.10+
and an authenticated Harness are prerequisites. There is no Node dependency.

Run from the repository root, using an output directory that already exists:

```sh
mkdir -p outputs/reviews
python3 scripts/deepseek-review.py \
  --repo "$PWD" \
  --file lib/contracts.ts \
  --file lib/requirement-extraction.ts \
  --task 'Review source grounding and requirement confirmation boundaries. Return concrete defects.' \
  --skill proofbeforepay-delivery \
  --skill security-best-practices \
  --output outputs/reviews/requirements-review-01.json \
  --dry-run
```

Remove `--dry-run` to perform the real review. Supply only installed, relevant
skills; the example names are not automatically installed. Each `--skill` selects
`.agents/skills/<name>/SKILL.md` in this checkout, adds its hash to the source
packet, and requires a successful native Harness `skill` tool call. Its returned
resource directory and complete instruction body must match that selected file
(after the Harness's documented frontmatter removal and outer-whitespace trim);
a same-named skill from another root or a changed body fails the review. Only
the load status is saved, not the runtime tool result. The standard
`sdk` profile discovers this project directory; `sdk-minimal` omits skills and is
not supported. No configuration or plugin install is performed by this script.

`--file` and `--skill` may repeat. `--task` is inline text. `--harness` can select
an executable when `dsh` is not on `PATH` or in the macOS application's usual
location. `--timeout` defaults to 360 seconds and accepts 10–600 seconds, plus at
most seven seconds of process teardown. The client never retries a review or
performs code mutations. Output must be a new `.json` file; existing files and
symlink targets are never overwritten. JSON is created with owner-only mode.

Source selection is deliberately limited to `app/`, `lib/`, `db/`, `tests/`,
`scripts/`, root `README.md`, and the explicitly selected project `SKILL.md`
documents. Traversal, symlinks, files outside the repository, env/auth/credential/
cookie/token/secret/output path components, binary/non-UTF-8 content, and obvious
bearer/private-key strings are rejected. Each file is limited to 120 KiB and the
whole packet to 240 KiB. **This is an allowlist, not a general secret scanner**:
review selected source before transmitting it. Dry-run checks these boundaries,
saves only names, sizes, line counts and SHA-256 hashes, and never starts Harness.

The model receives the selected source inline with explicit one-based line
numbers and is instructed to use only the
explicitly named `skill` tools. Harness is launched with its `read-only` permission
preset. The client rejects any non-skill tool call, PTC wrapper, failed skill
result, missing catalog entry, missing successful load, incomplete turn, missing
wait response, timeout, or invalid report. Event rejection is an audit boundary,
not an OS sandbox: a trusted Harness/plugin composition is still a prerequisite.

The result contains the final assistant text, a validated report, source hashes,
completion/error codes and minimal skill evidence (`name`, catalog/load booleans,
and call/load status). It excludes raw runtime contexts, request headers, thought
blocks, stderr, provider errors and complete tool results. The report has this
shape:

```json
{
  "summary": "...",
  "findings": [
    {
      "severity": "P2",
      "file": "lib/contracts.ts",
      "line": 12,
      "title": "...",
      "evidence": "Specific code and causal reasoning",
      "reproduction": "Concrete trace; label checks that were not executed",
      "suggestion": "Minimal correction"
    }
  ],
  "limitations": ["Static source review only"]
}
```

Only P1/P2/P3 findings are accepted. Every file must be in the supplied packet and
every line must exist. An empty findings array is permitted. `completed: true`
means the review protocol and schema succeeded. Every output is explicitly
`advisoryOnly: true`; findings still require an
independent human/agent judgment and appropriate implementation tests. It does
not verify a browser flow, deployment, live AI application integration, PayPal
settlement or competition submission.

Exit codes: `0` for a valid dry-run or completed review; `1` for an incomplete or
invalid review; `2` for rejected CLI input, file selection or output failure.

Run the offline boundary tests without accessing Harness:

```sh
python3 tests/deepseek-review.test.py
```

Protocol evidence was checked against the locally shipped package documentation:
`@deepseek-ai/dsh-sdk-jsonrpc-server` (`initialize`, `session/prompt`,
`session/wait`, `shutdown`, `session.event`); `dsh-agent-loop` (tool call data and
results linked by `callId`); `dsh-tool-skill` (catalog and `skill` result); and
`dsh-skill-filesystem` (project `.agents/skills` discovery). These packages ship
inside the Harness application; absolute installation paths are not required in
this tool's public interface.
