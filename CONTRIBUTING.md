# Contributing

Key Packet Press is a small, local-first TypeScript application. Contributions should preserve its
deterministic data contract, fail-closed review behavior, minimum-interaction workflow, and explicit
privacy boundary.

## Before changing code

- Use Node.js 20.19 or newer and install with `npm ci`.
- Read the product, architecture, data-contract, and privacy-safety documents.
- Use synthetic guest and room values in tests, screenshots, issues, and commits.
- Never add real rooming lists, generated guest PDFs, credentials, telemetry, remote fonts, or
  undisclosed network behavior.
- Report security issues privately as described in [SECURITY.md](SECURITY.md).

## Design constraints

- Keep file selection or drop as the necessary input.
- Start the safe local transformation automatically.
- Keep the explicit PDF download action because it controls the file write.
- Do not add redundant Run, Continue, Next, view-results, setup, mapping, account, or confirmation
  steps.
- Keep correction and replacement visible when a row is blocked.
- Keep room identifiers off the browser's closed-face preview and printed exterior.
- Do not silently infer, merge, repair, truncate, or transliterate supplied guest or room labels.
- Keep accepted label characters aligned with the WinAnsi repertoire used by the built-in
  `pdf-lib` Helvetica StandardFonts, with parser and PDF tests for any contract change.
- Do not add PMS mutation, key encoding, live room-state claims, authentication, or hosted-data
  behavior without a separately reviewed product and threat-model change.

## Validation

Run the narrowest relevant checks while working:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
```

Before proposing a release change, also run:

```sh
npm run build
npm run test:e2e
npm run audit
npm audit --audit-level=high
```

Playwright is used for E2E testing. The UI is framework-free, so the current component-test command
is an explicit not-applicable check. Do not convert E2E coverage to Cypress.

The release audit reads the focused `docs/key-packet-press` tree. Do not satisfy it by creating
legacy duplicate documents or by weakening its local-only, interaction, secret, or license checks.

## Pull-request expectations

A change should:

- explain the operator problem and why the interaction is necessary;
- update tests and the relevant focused documentation;
- identify any privacy, output-layout, dependency, or bundle-size effect;
- preserve synthetic-only fixtures and proof;
- report commands actually run and their exact outcomes; and
- distinguish local evidence from hosted, production, buyer, payment, usage, or revenue proof.

Do not claim release completion without a clean committed source state, a verified local SHA,
required release receipts, a remote SHA readback, and the remaining completion gates.
