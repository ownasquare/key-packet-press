# Key Packet Press Implementation Plan

> **Execution contract:** Implement this plan task by task with red-green-refactor discipline.
> Before every production stage, read Lane 16 state and stop stage work if the state is no longer
> active or `closeout_only` becomes true. Remove a durable queue item only after its named tests and
> validation pass.

**Goal:** Turn one finalized local group-rooming-list CSV into privacy-aware fold-in key-packet
inserts and an internal assembly index without retyping, room assignment, key encoding, accounts,
credentials, uploads, or provider calls.

**Architecture:** A static Vite and TypeScript browser app keeps all data in browser memory.
`rooming-list.ts` performs bounded CSV parsing and conservative classification. `packet-model.ts`
creates a stable print model with source-row provenance. `packet-pdf.ts` renders that model through
`pdf-lib`. `app.ts` owns only file interaction, automatic processing, state rendering, object-URL
lifecycle, and download. Vitest covers deterministic modules and DOM state; Playwright exclusively
covers end-to-end browser behavior.

**Tech stack:** Semantic HTML, mobile-first CSS, TypeScript, Vite, `pdf-lib`,
`@pdf-lib/fontkit`, a locally bundled Noto Sans Latin Extended font, Vitest with happy-dom, Biome,
Playwright, and `@axe-core/playwright`.

**Minimum-interaction decision:** Selecting or dropping the CSV starts processing automatically
because the local transformation is non-destructive and unsurprising. A clean-file result or a
fail-closed review result renders immediately. Downloading the generated PDF is the only essential
success action. When review is required, replacing the corrected CSV is the only recovery action
and no partial PDF exists. There is no Run, Continue, Next, mapping, confirmation, setup,
navigation, account, credential, or separate view-results action.

**Privacy and safety decision:** Each printable insert places the guest or party label on the
outside panel and the supplied room identifier on the inside panel behind a marked fold. The
internal assembly index may show the pair because it is explicitly marked staff-only and repeats
the generated timestamp, secure-after-use reminder, and “Reprint after any room move.” The PDF
does not contain the source filename. Any missing value, exact duplicate, or repeated guest label
across different rooms blocks generation until the operator supplies a corrected CSV. Repeated
room identifiers with different guest labels remain allowed because separate roommate packets are
a valid source-declared pattern. The app never asserts that a room is current, assigns or encodes
a key, verifies identity, determines occupancy, authorizes access, contacts a guest, or
synchronizes a property-management system.

---

## Task 1: Establish the independent repository and quality contracts

**Create:**

- `.gitignore`
- `.npmignore`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `biome.json`
- `index.html`
- `src/styles.css`
- `src/app.ts`
- `scripts/audit.mjs`

**Repository contract:**

- Initialize a standalone Git repository with branch `main`.
- Pin exact package versions.
- Use Node `>=20`.
- Set `"type": "module"`, `"private": true`, and `"license": "MIT"`.
- Include `pdf-lib`, `@pdf-lib/fontkit`, and `@fontsource/noto-sans` as the only runtime
  dependencies so Latin Extended packet labels render locally without a remote font request.
- Add exact development dependencies for TypeScript, Vite, Vitest, happy-dom, Biome, Playwright, and
  Axe.
- Provide scripts:
  - `dev`: Vite on `127.0.0.1`
  - `build`: Vite production build
  - `preview`: Vite preview on `127.0.0.1`
  - `format`: Biome write
  - `format:check`: Biome check without writes
  - `lint`: Biome lint
  - `typecheck`: `tsc --noEmit`
  - `test`: Vitest run
  - `test:component`: a truthful non-React not-applicable message
  - `test:e2e`: build then Playwright
  - `audit`: local source, interaction, secret, network, required-file, and license checks
  - `validate`: format, lint, types, unit tests, build, audit, and E2E

**Initial page contract:**

- `index.html` declares the product name, one file input associated with a large drop label, an
  `aria-live` status region, and app-owned result mount.
- There is no form submission, select, navigation landmark, password field, provider field, or
  hidden settings surface.
- The initial CSS is only enough to load a readable page; final design comes in Task 7.

**Validation commands:**

```text
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /usr/bin/git init -b main
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm install
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm run build
```

**Pass conditions:**

- `package-lock.json` exists.
- `git branch --show-current` returns `main`.
- The build succeeds without network calls at runtime.
- The app directory contains no worktree pointer and no inherited repository files.

## Task 2: Specify bounded CSV parsing before implementation

**Create:**

- `src/core/rooming-list.ts`
- `tests/unit/rooming-list.test.ts`
- `tests/fixtures/valid-rooming-list.csv`
- `tests/fixtures/review-rooming-list.csv`

**Public types and functions:**

```ts
export type PacketRow = {
  sourceRow: number;
  guestLabel: string;
  roomLabel: string;
};

export type ReviewNotice = {
  kind: "ambiguous-guest" | "duplicate" | "missing-guest" | "missing-room";
  message: string;
  sourceRow: number;
};

export type RoomingListResult = {
  notices: ReviewNotice[];
  packets: PacketRow[];
  sourceRowCount: number;
};

export class RoomingListError extends Error {
  userMessage: string;
}

export function decodeRoomingList(bytes: Uint8Array): string;
export function parseRoomingList(csvText: string): RoomingListResult;
```

**Write failing tests first for:**

1. UTF-8 BOM removal.
2. RFC 4180-style quoted commas, escaped quotes, CRLF, LF, and quoted line breaks.
3. Guest aliases: `guest`, `guest name`, `guest_name`, `name`, `party`, `party name`,
   `packet name`.
4. Room aliases: `room`, `room number`, `room_number`, `room no`, `room_no`, `room id`.
5. Case, punctuation, and surrounding-whitespace normalization for header matching.
6. Failure when a guest or room column is missing.
7. Failure when multiple columns match the same required role.
8. Fully blank data rows ignored without a notice.
9. Missing guest or room values excluded with source-row notices.
10. Every exact normalized guest-room duplicate occurrence is cited in review notices and makes
    the result ineligible for PDF generation; no occurrence is silently chosen as authoritative.
11. Repeated room identifiers with different guest labels are retained because separate roommate
    packets are a valid source-declared pattern.
12. Repeated normalized guest labels across different rooms are all cited as ambiguous and make
    the result ineligible for PDF generation; the operator must supply distinct packet labels.
13. Stable custom ASCII-digit natural room ordering, then case-folded guest-label ordering, then
    source row; do not rely on runtime-specific ICU collation.
14. No silent spelling correction, room reassignment, occupancy inference, or cross-row merge.
15. Malformed quotes, invalid UTF-8, more than 2 MiB, more than 2,000 data rows, and zero usable
    packets produce `RoomingListError` with one plain-language recovery sentence.
16. Payment, government-ID, medical, and accessibility-note headers block the file even when those
    columns are otherwise unused.
17. ASCII control characters other than permitted CSV newlines, Unicode bidi override or isolate
    controls, and NUL bytes block the implicated row.
18. Guest or room display values that cannot fit at the documented minimum font size block the
    implicated row rather than truncating.
19. Benign unused columns do not enter the packet model, DOM, PDF drawing model, metadata, logs, or
    storage.

**Red command:**

```text
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm test -- tests/unit/rooming-list.test.ts
```

The failure must be caused by missing behavior, not a broken fixture or test runner.

## Task 3: Implement the deterministic rooming-list parser

**Implement in `src/core/rooming-list.ts`:**

- Decode bytes with `TextDecoder("utf-8", { fatal: true })`.
- Reject byte length above `2 * 1024 * 1024`.
- Parse CSV with a small explicit state machine; do not split rows on commas.
- Normalize headers by lowercasing and collapsing punctuation or whitespace solely for alias
  matching.
- Trim surrounding field whitespace but preserve internal display whitespace and spelling exactly.
- Track physical source row numbers even when quoted values span lines.
- Detect duplicate pairs and repeated guest labels with comparison-only case and whitespace
  normalization, cite every implicated source row, and never select an authoritative row.
- Preserve candidate rows for review, but expose `notices.length > 0` as a fail-closed generation
  boundary.
- Sort with a small custom tokenizer that compares ASCII digit runs numerically and remaining text
  by stable lowercased code-point order, then uses source row as a tiebreak.
- Return immutable data structures or fresh values that callers cannot mutate across runs.

**Green and refactor commands:**

```text
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm test -- tests/unit/rooming-list.test.ts
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm run typecheck
```

**Pass conditions:**

- All nineteen parser behaviors pass.
- Error copy contains no error code, stack trace, or technical jargon.
- Source rows are exact.
- Identical input text produces structurally identical output.
- No PDF-layer caller may treat a result with notices as generation-ready.

## Task 4: Specify the packet document model before rendering

**Create:**

- `src/core/packet-model.ts`
- `tests/unit/packet-model.test.ts`

**Public contract:**

```ts
export type PacketInsert = {
  guestLabel: string;
  roomLabel: string;
  sequence: number;
  sourceRow: number;
};

export type PacketDocumentModel = {
  generatedAtIso: string;
  inserts: PacketInsert[];
  sourceRowCount: number;
};

export function createPacketDocumentModel(
  result: RoomingListResult,
  generatedAt: Date,
): PacketDocumentModel;
```

**Write failing tests first for:**

- Stable one-based sequence assignment after sort.
- A valid ISO timestamp from an injected `Date`.
- Preservation of accepted source rows.
- No derived guest identity, title, status, room state, arrival state, occupancy state, or access
  authorization.
- Rejection of invalid dates, empty packet collections, and any result containing a review notice.
- No source filename, local path, or browser metadata in the model.

**Commands:**

```text
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm test -- tests/unit/packet-model.test.ts
```

Implement the smallest model code, then rerun until green.

## Task 5: Specify the privacy-aware PDF before implementation

**Create:**

- `src/core/packet-pdf.ts`
- `tests/unit/packet-pdf.test.ts`

**Public contract:**

```ts
export type PacketPdfResult = {
  bytes: Uint8Array;
  filename: string;
  insertPageCount: number;
  totalPageCount: number;
};

export async function generatePacketPdf(
  model: PacketDocumentModel,
): Promise<PacketPdfResult>;
```

**Fixed document geometry:**

- US Letter portrait pages.
- Four inserts per page in two columns and two rows.
- Page size: `612 × 792 pt`.
- Outer margins: `36 pt`.
- Column gutter: `18 pt`.
- Row gutter: `18 pt`.
- Insert size: `261 × 351 pt`.
- Horizontal fold at `175.5 pt` within each insert.
- Safe text inset: `18 pt` on every insert edge.
- Each insert has:
  - an outside panel with packet id `KP-###` and guest or party label;
  - a dotted fold line;
  - an inside panel with the supplied room identifier, generated timestamp, `Not a current-room
    verification`, and `Reprint after any room move`;
  - restrained copy: `Fold room number inward before staging`.
- No QR code, barcode, key code, lock code, reservation identifier, payment field, guest note, or
  claim of a current assignment.
- After insert pages, include an `INTERNAL ASSEMBLY INDEX` page or pages with sequence, guest or
  party label, supplied room, source row, generated timestamp, and the exact warning
  `Reprint after any room move.`
- Repeat `STAFF ONLY · SECURE OR DESTROY AFTER ARRIVAL` and the room-move warning on every index
  page.
- Never render a PDF from a model with review notices.

**Write failing tests first for:**

1. A nonempty `%PDF-` artifact parseable by `PDFDocument.load`.
2. Four inserts per insert page.
3. Correct insert and total page counts for 1, 4, 5, and 33 packets.
4. Model strings remain represented in the intermediate drawing-command model without truncation
   that hides a guest or room label.
5. Long labels wrap within a bounded number of lines and receive a visible review notice if they
   exceed the printable bound.
6. Internal index always exists.
7. Exact generated timestamp, staff-only reminder, secure-or-destroy reminder, and reprint warning
   exist on every internal index page.
8. Locally bundled Noto Sans Latin Extended embedding with font subsetting; no remote font.
9. Stable geometry and page count for identical model input.
10. Download filename `key-packets-YYYY-MM-DD.pdf` uses the injected timestamp.
11. Exterior drawing commands contain no supplied room identifier.
12. Source filename, benign ignored-column values, and blocked-row values never appear in content
    commands or metadata.

**Implementation notes:**

- Separate `buildPacketPages(model)` from `renderPacketPages(pages)` so content and geometry can be
  tested without brittle PDF text extraction.
- Register `@pdf-lib/fontkit`, decode the Vite-inlined Noto Sans Latin Extended WOFF data URL
  locally, subset the embedded font, and make no runtime font request.
- Set document metadata from injected model values; do not let library defaults create hidden
  nondeterministic test behavior where avoidable.
- Use a single palette that remains legible when printed in grayscale.

**Commands:**

```text
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm test -- tests/unit/packet-pdf.test.ts
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm run typecheck
```

## Task 6: Specify the automatic browser state machine

**Create:**

- `src/app.ts`
- `tests/unit/app.test.ts`

**State model:**

```ts
type AppState =
  | { kind: "idle" }
  | { kind: "processing"; filename: string }
  | { kind: "review"; filename: string; result: RoomingListResult }
  | { kind: "success"; model: PacketDocumentModel; pdf: PacketPdfResult; url: string }
  | { kind: "generation-error"; message: string }
  | { kind: "download-error"; message: string; url: string }
  | { kind: "error"; message: string };
```

**Write failing happy-dom tests first for:**

1. The drop label activates the one file input.
2. Selecting a CSV starts processing without a Run, Continue, Next, or confirmation action.
3. Dropping a CSV follows the same code path.
4. Status uses `role="status"` or `aria-live="polite"` during work and success.
5. A clean file renders packet count, generated time, a compact closed-face preview, and the
   essential `Download packet PDF` link immediately.
6. No separate view-results action exists.
7. The drop surface stays usable and changes its concise label to `Replace CSV`.
8. Replacing the file revokes the prior object URL exactly once and generates a new one.
9. Unmount or page lifecycle cleanup revokes the current object URL.
10. Missing values, exact duplicates, ambiguous repeated guest labels, prohibited sensitive
    columns, unsafe control text, and overlong printable values render a `review` state with every
    implicated source row, no PDF bytes, and no download control.
11. Invalid type, empty file, parse failure, and zero usable packets show one plain-language
    sentence whose recovery action is replacing the CSV.
12. Generation and download failures preserve only the minimum safe state needed to retry or
    replace the CSV, without exposing technical details.
13. A monotonically increasing processing token prevents a slower prior file job from replacing a
    newer file's state.
14. Error and review states contain no error code, stack trace, jargon, or destructive dismissal.
15. The source file bytes and rows are never persisted to local storage, session storage,
    IndexedDB, cache storage, cookies, telemetry, or network.

**Implementation notes:**

- Accept `.csv` and `text/csv`, but do not rely only on MIME because browser file types vary.
- Yield once before CPU work so the processing state can paint.
- Reuse one `processFile(file)` path for picker and drop.
- Check `File.size` before reading bytes.
- Increment the processing token before every new file and compare it before committing any async
  result.
- Keep result markup on the current surface below the input; do not route or open a secondary
  page.
- Use semantic `<a download>` for the generated PDF rather than a provider or print service.
- Do not add a sample-data button to the primary product.

**Commands:**

```text
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm test -- tests/unit/app.test.ts
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm run typecheck
```

## Task 7: Implement the responsive visual and accessibility contract

**Update:**

- `index.html`
- `src/styles.css`
- `src/app.ts`

**Visual hierarchy:**

- Quiet product mark: `KEY PACKET PRESS`.
- Direct headline: `Turn a final rooming list into ready-to-fold key packets.`
- One-line boundary: `Your CSV stays in this browser.`
- Large centered drop surface with a file icon drawn in CSS or inline accessible SVG.
- During success, the drop surface becomes compact but remains clearly available for replacement.
- A clean result uses a status summary, restrained closed-face insert preview, and the essential
  download action.
- A review result uses a prominent source-row list and the concise recovery sentence `Correct
  those rows, then replace the CSV.` It has no packet preview or download.
- Footer copy: `Uses only the rooming list you provide · No room assignment or key encoding`.

**CSS tokens:**

- System font stack only; no font request.
- Warm off-white and deep ink in light mode; deep charcoal and warm white in dark mode.
- One blue-green action color with WCAG AA text contrast.
- Radius scale `12px`, `18px`, `28px`.
- Focus outline at least `3px`.
- Touch targets at least `44px`.
- Content max width around `960px`.
- Responsive breakpoints driven by available space, with no horizontal scroll at widths from
  `320px` through `1440px`.
- `prefers-color-scheme` selects appearance automatically; no theme control.
- `prefers-reduced-motion` removes nonessential transition.

**Accessibility requirements:**

- Visible focus for the drop label and download link.
- Drop label is keyboard-activatable through its associated file input.
- Decorative SVG is hidden; meaningful icon text is not required.
- Status updates do not steal focus.
- Review notices use a real heading and list.
- Preview is not the sole source of output status.
- Color is never the only distinction between accepted and excluded rows.

**Static and unit checks:**

- No select, combobox, navigation menu, dialog, account field, credential field, or redundant
  workflow action.
- One chosen file input is a product-specific implementation decision, not a universal factory
  gate.
- No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, or remote asset URL.

## Task 8: Prove the real local workflow with Playwright

**Create:**

- `tests/e2e/key-packet-press.spec.ts`
- `tests/fixtures/valid-rooming-list.csv`
- `tests/fixtures/review-rooming-list.csv`
- `tests/fixtures/malformed-rooming-list.csv`
- `proof/browser/.gitkeep`

**Playwright projects:**

1. Desktop light: `1440 × 1000`
2. Desktop dark: `1440 × 1000`
3. Tablet light: `820 × 1180`
4. Tablet dark: `820 × 1180`
5. Phone light: iPhone 13 emulation
6. Phone dark: iPhone 13 emulation

**E2E assertions:**

- Correct title, headline, privacy boundary, and drop surface appear.
- `setInputFiles` triggers processing without another initiation action.
- Result appears without navigation or separate view-results action.
- Download starts, has MIME `application/pdf`, uses the expected filename, and begins `%PDF-`.
- PDF can be loaded and has the expected page count.
- Review fixture shows all implicated row numbers, no download, and no generated PDF.
- Malformed fixture shows the friendly recovery sentence; replacing it with the valid fixture
  succeeds without reload.
- No uncaught page error, failed request, unexpected external request, console error, horizontal
  overflow, or inaccessible critical control.
- Axe reports zero serious or critical violations.
- The primary workflow can be initiated within ten seconds by an unfamiliar user in the test
  script; processing latency is measured separately and not called instantaneous.
- No Run, Continue, Next, View results, login, signup, settings, mapping, provider, or credential
  control exists.
- Keyboard-only traversal reaches the native file input, replacement input, and download with
  visible focus.
- A stale processing job cannot overwrite a newer result.
- Download failure retains the generated result and offers the same essential download action
  again without a confirmation step.
- Screenshot each project’s success state to `proof/browser/<project>.png`.
- Capture review-blocked, fatal-error, focus-visible, downloaded, and recovery states in the proof
  directory with synthetic data only.

**Commands:**

```text
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm run test:e2e
```

After the command, inspect every PNG with the local image-viewing tool. A passing test does not
replace visual inspection.

## Task 9: Complete product, architecture, security, and continuation documentation

**Create:**

- `README.md`
- `LICENSE`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `CHANGELOG.md`
- `docs/product/architecture-and-decisions.md`
- `docs/product/monetization-hypothesis.md`
- `docs/key-packet-press/2026-07-27-completion.md`
- `docs/handoffs/2026-07-27-codex-key-packet-press.handoff.mdc`

**README must include:**

- Exact outcome and non-outcomes.
- Minimum-interaction workflow.
- CSV header aliases and a synthetic example.
- The fact that missing values, exact duplicates, ambiguous repeated guest labels, prohibited
  sensitive columns, unsafe control text, and unprintable overlong values block PDF generation and
  require a corrected replacement file.
- The fold-in privacy design and internal-index warning.
- Install, dev, test, build, preview, audit, E2E, and full validation commands.
- Browser and Node requirements.
- Local-only data boundary.
- No hosted, production, provider, buyer, payment, usage, revenue, or demand proof.
- MIT license.

**Architecture document must include:**

- Module boundaries and data flow.
- Input and resource bounds.
- Determinism and injected-time decision.
- Object-URL lifecycle.
- Automatic processing rationale under the minimum-interaction contract.
- Why no mapping UI exists.
- Threat model and excluded sensitive fields.
- Fail-closed review decision, exact PDF layout geometry, source-filename omission, and privacy
  tradeoff.
- Known limitations: finalized lists only, no live room-state proof, no key encoding, no PMS sync,
  no scanned spreadsheets, no XLSX, no arbitrary locale inference, and no security guarantee.

**Completion document must include:**

- Touched and committed paths.
- Exact validation commands and outcomes.
- Browser projects and screenshot inspection.
- Commit evidence fields.
- Push evidence fields.
- Lane claim and state.
- Separate hosted, production, provider, payment, and demand proof.
- Warning triage and suppression status.

**Handoff must include:**

- Current state and immutable claim.
- Architecture and interaction decisions.
- Completed and remaining queue items.
- Exact commands and evidence paths.
- Local and remote SHA once available.
- Blockers or explicit none.

## Task 10: Implement the local release audit and run every gate

**Create or update:**

- `scripts/audit.mjs`
- `proof/release-validation.json`

**Audit script requirements:**

- Read every required open-source and completion file.
- Inspect source, HTML, and configuration for likely embedded secrets.
- Reject runtime network primitives and remote asset URLs.
- Reject credential, login, signup, mapping, settings, redundant Continue, redundant Next, and
  separate view-results controls.
- Assert the chosen CSV input and immediate result mount exist.
- Check package-lock dependency licenses against an explicit permissive allowlist.
- Check fixture paths and ensure fixture values match the documented synthetic set.
- Print a concise pass receipt without echoing source data.

**Full local gates:**

```text
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm run format
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm run validate
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm audit --audit-level=high
/Users/fortunevieyra/.codex/bin/codex-secret-safe-exec.py -- /Users/fortunevieyra/.nvm/versions/node/v20.19.4/bin/npm pack --dry-run
```

Then:

- Remove only regeneratable `node_modules` after validating its exact app-local path.
- Run `npm ci`.
- Run `npm run validate` again from the clean install.
- Start the preview server and perform a real local download smoke.
- Run the workspace secret scanner, license check, and runbook validation helper if available.
- Inspect every screenshot.
- Record environment, fixture integrity, localhost integrity, warnings, suppression status, and
  exact results in `proof/release-validation.json`.

No warning may be silently suppressed. A toolchain warning may be documented as non-product only
after direct triage.

## Task 11: Create the validation receipt and coherent clean main commit

**Create:**

- `proof/validation-receipt.json`

**Update:**

- `docs/key-packet-press/2026-07-27-completion.md`
- `docs/handoffs/2026-07-27-codex-key-packet-press.handoff.mdc`

**Receipt contract:**

- Use the current runbook helper and exact receipt schema.
- Identify the exact source state, validation commands, results, fixtures, browser proof, warnings,
  proof boundaries, and app path.
- Verify the receipt before publication.

**Commit sequence:**

1. Read Lane 16 state; stop if not active or if closeout-only.
2. Run the critical build, unit, audit, and E2E gates.
3. Inspect `git status --short`, `git diff --check`, and the complete app diff.
4. Stage only explicit app-repository paths.
5. Commit on `main` with a scoped message through `--argv-b64` because the message contains
   whitespace.
6. Read local HEAD.
7. Update completion and handoff commit evidence if the runbook permits a second documentation
   commit; otherwise record commit evidence in the validation receipt before the coherent commit.
8. Require a clean worktree and rerun the critical smoke at committed HEAD.

**Pass conditions:**

- Branch is `main`.
- Worktree is clean.
- Completion documentation names all committed paths and validation commands.
- Local SHA is exact and becomes the publication input.

## Task 12: Publish, read back, close the registry, and finish automation evidence

**Publication:**

- Invoke `/Users/fortunevieyra/.codex/bin/codex-ai-project-github-publish.py` with:
  - exact app directory;
  - repository name `key-packet-press`;
  - public description;
  - verified validation receipt.
- Do not switch or mutate the global GitHub CLI account.
- Require public visibility, default branch `main`, and remote `main` equal to local HEAD.
- Independently read back repository metadata and the remote SHA.
- Call `record-github` only with the verified URL and matching SHAs.

**Registry record:**

- Create `docs/1000-apps-100-days/registry/apps/20260727T172616-0700-lane16-key-packet-press.md`
  or the exact runbook-required completed-record name.
- Include the immutable claim, semantic fingerprint, qualification evidence, safety boundary,
  minimum-interaction decision, exact commit evidence, exact push evidence, validation commands,
  documentation paths, and separate proof fields.

**State closeout:**

1. Remove each queue item only after its validation passes.
2. Checkpoint `github_published` after verified publication.
3. Checkpoint `registry_closed` only after the immutable completed-app record exists.
4. Checkpoint `closeout` with an empty queue.
5. Call `complete-app`.
6. Read state back and require `status=complete`, `next_step_count=0`, and
   `github_push_verified=true`.

**Automation closeout:**

- Run self-learning post-run for `1000-apps-lane-16-hospitality-travel-events`.
- Update automation memory with the concise run decision, evidence, result, and current runtime.
- Refresh the live automation TOML `next_steps` with at least twenty detailed future-cycle steps
  using `What`, `Where`, `Why`, and `How`, without inventing remaining work on this completed app.
- Sync approved repo mirrors.
- Refresh:
  - automation `handoff.mdc`;
  - app handoff;
  - AI Projects `docs/handoffs` handoff;
  - required canonical home-scope completion handoff.
- Final visible closeout must include exact app path, branch, local SHA, committed paths, validation
  commands, repository URL, visibility, default branch, remote SHA, API readback, lane status,
  stage, remaining seconds, completed and remaining next steps, claim, blockers, and separate
  hosted, production, provider, payment, and demand proof.

Stop when Lane 16 state is complete. Do not start another app or add filler.
