# Seller integration preparation

The existing booking-page guide now includes a compact bilingual three-step
preparation flow. It configures deployment-owned selectors and backend metadata,
checks a local HTML file without sending it to the server, and generates one
complete preparation ZIP: current configuration, connector, setup instructions,
backend protocol checklist, pinned DOM adapter/bridge dependencies and a SHA-256
inventory. The browser fetches and verifies those fixed dependencies before
offering the ZIP for download; it does not fetch or execute the seller's site.
The four individual text templates remain an optional export without dependencies.

The booking area offers four navigation steps: check the supported scope,
confirm page controls and download preparation, submit deployed staging details,
then review the actual agreement/registration/run prerequisites. These are
directions, not completion status. Opening a step does not submit a declaration,
adopt an agreement, run a test, accept work or pay. Missing permission or setup
remains explicit in the corresponding existing controls. The 13 confirmations
are grouped as create (4), cancel (3), move (4), and retry/result (2); closed
native disclosures retain their controls and mappings.

## What changed

The generated connector uses the actual `createSellerDomExecutor` and
`installSellerBridge` interfaces. It exposes `getPendingProofCommand()` and
`completeProofOperation(...)` for the native handler. A native completion must
provide its real synthetic request journal; the connector stamps the displayed
result with the issued sequence before resolving the SDK subscription. It never
implements the booking, cancellation, move or retry itself. Closed `details`
ancestors of mapped controls are opened before execution; framework-specific
conditional views still require explicit seller code and browser testing.

Editing any configuration field or selecting another local HTML file invalidates
the old preflight. Downloads require a fresh valid configuration check. The
report keeps the backend and runtime marked unverified even if static controls
all match. The original SDK/source links and technical scope remain available.

## Local preflight

```sh
node --experimental-strip-types scripts/seller-onboarding-preflight.mjs /absolute/path/pbp-onboarding.json /absolute/path/index.html
```

The CLI reads only two explicitly selected local UTF-8 files, config up to32KiB
and HTML up to256KiB. It rejects symlink inputs, malformed/extra configuration,
unsupported protocol declarations, placeholder parent origins, unsafe backend
paths, missing/ambiguous selectors, incompatible control types and missing
instruction options. It has no fetch, subprocess, page-script execution,
registration, database or payment code. Exit0 means static markup ready,
exit1 means a static issue or unknown, exit2 means unreadable/invalid input.

Supported selectors: tag, `#id`, `.class`, `[attribute]`, `[attribute=value]`,
descendants and `>` children, up to four compounds. Lists, escapes, pseudo
classes, wildcards and sibling selectors are rejected rather than approximated.
Use stable IDs/data attributes when the native selector is outside this subset.

Disabled, hidden and readonly controls remain unknown until the corresponding
operation makes them usable. CSS visibility, selectors inside runtime-created
DOM, framework state retention, handler effects and backend behavior require
the approved runtime tests. A successful static fixture deliberately has no
handlers, demonstrating why preflight is not runtime evidence.

## Privacy and authority

The downloaded preparation contains chosen selectors, parent origin, same-origin
path and revision, not project source, contracts or runtime credentials. Do not
enter secrets or customer data in these fields. Common credential-like values
are refused, but this is not a general secret scanner. The user chooses local
HTML; its contents are used in memory and are not included in the downloads.
The ZIP's integrity checks establish its known preparation inventory, not a
connection to the seller's backend, successful browser download storage or
approval of a deployed staging site.

Only the existing fixed `booking-lifecycle-http-v1` protocol is supported.
Configuration does not map arbitrary backend fields automatically. The seller
must implement/map its native backend to that contract and submit the exact
delivery manifest for authorised review. No project membership, operator grant,
deployment approval, authenticity claim, acceptance or payment is created.

No independent external developer onboarding time or success rate has yet been
measured. This flow reduces manual preparation; it does not fill that external
validation gap.
