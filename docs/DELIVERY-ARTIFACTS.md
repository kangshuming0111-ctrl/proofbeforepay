# Delivery artifact metadata and deployed bytes

The uploaded HTML/CSS/raster bundle remains the delivery identity. JavaScript is
never added to that executable preview. A seller may instead select local JS/MJS
build outputs and save a separate, append-only declaration containing path,
byte length and SHA-256. The browser hashes the selected bytes before submission;
no source text is sent. A caller-supplied hash remains a seller declaration, not
an independent build or origin attestation.

Each public version-1 manifest contains its generated ID, project/delivery IDs,
the original HTML/CSS/raster delivery digest, server timestamp, sorted file list,
and a digest of that public projection. The actual submitting actor lives only
in D1 metadata. Public manifests can therefore be exported without changing a
nested plan digest during identity redaction. The API authenticates the actual
seller; the requested browser role is not authority. Seller consent and the
previous total manifest count are required. Quote-version and history-count SQL
guards reject stale/concurrent saves. No quote, acceptance or payment is changed.
Once accepted or payment-locked, a delivery cannot receive a new declaration.

Bounds: at most 32 JS/MJS files, 2 MiB each, 8 MiB declared total, canonical ASCII
relative paths with at most five segments/160 characters, and eight retained
manifest declarations per project. The folder root must match the uploaded
package root. Other file types are excluded with a notice. A newer declaration
retains the earlier declaration and makes earlier deployment checks historical,
even if the underlying HTML/CSS delivery has not changed.

A legacy version-1 deployment plan has its original exact schema, static file
limits and 30-second window. A version-2 plan embeds the complete validated public
manifest, direct HTML script coverage and all expected byte hashes. It can issue
at most 72 finite GET requests within a 45-second session window. Each read also
has a six-second maximum, strict kind-specific MIME check, streaming per-file
bound and shared 8 MiB plus static-package byte budget. Requests omit credentials,
never follow redirects, never execute scripts and map only declared paths below
the approved staging entry directory. Approval, delivery and manifest are checked
before each subsequent GET. A changed declaration stops subsequent reads; already
read data remains the historical record. Failed persistence is not silently
retried; an expired interrupted run can be closed with retained unknowns.

Coverage uses a parser to inspect direct HTML script elements. The report keeps
missing declarations visible, identifies inline/external/rooted/query/encoded or
HTML-base references as unknown, ignores non-code JSON script elements, and caps
coverage at 200 rows with a visible unknown overflow row. It does not parse JavaScript
imports, dynamically inserted scripts, service workers, CDN modules, WASM, fonts,
source maps or backend builds. All matching listed bytes still represent partial
coverage, not an assertion that the whole website is correct. Different outputs
caused by minification, encoding or transformations need human explanation.
There is no protection against selective serving or future deployment changes.

A version-2 offline replay must rebuild `createDeploymentSourcePlan` from the
exact core uploaded files, registration and embedded artifact manifest, then
compare the complete generated plan. `validateDeploymentSourceSession` validates
both saved schema versions and derives matched/mismatch/unknown results from the
retained expected/actual hashes; neither digest is a server signature.

The executable counterexample is `tests/deployment-artifacts.test.ts`: an owned
HTTP server returns unchanged HTML/CSS and a different `app.mjs`. Both static
files match while the JS reading is a mismatch. The fresh D1 smoke uses blocked
outbound transport for permission, append-only history, count-CAS, stale manifest,
legacy report and acceptance-lock checks. It is not a real authenticated browser
or actual PayPal test.
