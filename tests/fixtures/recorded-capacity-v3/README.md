# Recorded v3 accepted evidence

`evidence.json` is an unchanged, allowlisted current-delivery export captured on
2026-11-03. It is public synthetic test data for the existing offline verifier.

The main workbench ran in an isolated local developer fixture. A developer AI
operated its buyer/seller views: two separate original clauses were locked, a
flawed report was reviewed, a change request was attached to the slot-capacity
clause, and a replacement was checked and explicitly accepted. The retained
current report used actual HTTP requests to the operator-owned hosted native
capacity service. The accepted revision has seventeen expected observations,
two browser layout readings and three explicit manual-check flags.

Those three flags were clicked during the developer AI test. They do not
represent independent human review, separate real buyer/seller participants or
an external user study. No model judgment was called and no payment was made in
this capture. The native service is a controlled synthetic target, not an
independent third-party seller deployment.

The file contains **only the accepted current revision 2**, its source files,
reports and frozen acceptance snapshot. The earlier flawed delivery and change
request are not included in this current-delivery-only export. Its runtime report
retains the exact per-booking maximum of 6 and complete, separate slot-total
clause of 8. The acceptance snapshot points to that exact seventeen-step report,
file digest and target; a later report must not replace this reference.

The export was checked for identities, email addresses, invitation or credential
fields, credential-like values, local filesystem paths and authenticated URLs.
It contains fictional source content, generated IDs, timestamps and the public
verification-lab origin. No account identities, invitations, passwords, provider
keys or payment records were copied. The original bytes were preserved:

```text
bytes: 28906
SHA-256: 70916546f9752fb08acdb0af811f98bb303654bb49ac2d1f3f17a2bb11b172b6
```

Choose this JSON file in the public guest lab's `verify.html` evidence viewer, or
run the existing offline CLI:

```sh
node scripts/verify-evidence-export.mjs tests/fixtures/recorded-capacity-v3/evidence.json
```

Verification replays bounded static rules and checks internal file, report and
historical-reference consistency. It does not rerun the backend, execute the
delivered HTML or contact a model/payment API. A consistent result is **not** a
signature, proof of capture authenticity, independent acceptance, frontend-to-
backend deployment attestation, or a guarantee that the site is free of bugs.
