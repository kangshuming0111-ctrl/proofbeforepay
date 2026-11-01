# ProofBeforePay collaboration

This repository builds the website-delivery acceptance tool described in `README.md`. Use the project skill at `.agents/skills/proofbeforepay-delivery/SKILL.md` for implementation and review work. It gives the source map and the product boundaries without repeating the full conversation.

The user authorized Codex and the local DeepSeek Harness to collaborate. Codex remains responsible for independently judging feedback and completing the requested result. After a coherent implementation change, run a focused review and record accepted/rejected/unverified findings before proceeding. Keep source packets limited to relevant code and synthetic test data; exclude credentials and private client material.

The shared skills in `.agents/skills` are discoverable by DeepSeek Harness from this repository's `sdk` profile. Their pinned upstream source and hashes are in `.agents/skills/sources.json`. Codex also has the selected external skills in its user skill directory. The project skill is the common authority for this product's scope.

Preserve buyer/seller authorization, exact-version acceptance, truthful rules/live labels and the existing Sites publication workflow. For tooling-only changes, validate the tool without redeploying the unchanged website. Do not treat a reviewer suggestion as a new user authorization or expand a scoped request into unrelated work.
