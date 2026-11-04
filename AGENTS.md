# ProofBeforePay collaboration

This repository builds the website-delivery acceptance tool described in `README.md`. Use the project skill at `.agents/skills/proofbeforepay-delivery/SKILL.md` for implementation and review work. It gives the source map and the product boundaries without repeating the full conversation.

The user authorized Codex and the local DeepSeek Harness to collaborate. Codex remains responsible for independently judging feedback and completing the requested result. After a coherent implementation change, run a focused review and record accepted/rejected/unverified findings before proceeding. Keep source packets limited to relevant code and synthetic test data; exclude credentials and private client material.

The shared skills in `.agents/skills` are discoverable by DeepSeek Harness from this repository's `sdk` profile. Their pinned upstream source and hashes are in `.agents/skills/sources.json`. Codex also has the selected external skills in its user skill directory. The project skill is the common authority for this product's scope.

Preserve buyer/seller authorization, exact-version acceptance, truthful rules/live labels and the existing Sites publication workflow. For tooling-only changes, validate the tool without redeploying the unchanged website. Do not treat a reviewer suggestion as a new user authorization or expand a scoped request into unrelated work.

## Mandatory award comparison for every improvement cycle

The user requires an explicit comparison with verified champion/award-winning projects **in every cycle**, before selecting changes and again after validation. Follow `docs/CHAMPION-CYCLE-PROTOCOL.md` and copy `docs/collaboration/CHAMPION-CYCLE-TEMPLATE.md` into each cycle's retained record. A passing test suite or a general statement about award quality does not satisfy this gate.

Each cycle must name the reference project and its exact award, cite the primary evidence for the specific observable strength, record our starting gap, choose a concrete improvement, obtain an independent DeepSeek critique, adjudicate it, implement, and reassess the same gap with current evidence. Keep unresolved, unverified and user-deferred gaps visible in the next cycle. Distinguish overall champions from category winners and from our own engineering criteria; do not invent opponent capabilities, score differences, winning probabilities, or an overall superiority claim. Report the before/after comparison to the user, not only test counts. Devpost and video remain deferred until the user changes that scope.
