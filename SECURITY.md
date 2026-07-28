# Security policy

Key Packet Press handles guest or party labels and supplied room identifiers, which can become
sensitive when associated. Please treat both source files and generated PDFs accordingly.

## Supported versions

The repository is pre-release and has no published, supported version yet. Security fixes currently
target the latest source on `main`; no support or response-time guarantee is offered.

## Reporting a vulnerability

Do not open a public issue containing a real rooming list, guest name, room identifier, generated
PDF, exploit detail, or other sensitive material.

Once the public repository exists, use its private GitHub vulnerability-reporting channel when
available. Before publication, contact the maintainer through the private channel by which you
received the source. A report should contain:

- a concise description of the issue and impact;
- the affected source revision, browser, and operating system;
- reproduction steps using synthetic data only; and
- a minimal proof that does not include credentials or real guest information.

There is no guaranteed acknowledgement or remediation timeline while the project remains
pre-release.

## Security boundary

The application is designed to:

- parse one local CSV in browser memory;
- avoid application-initiated API calls, telemetry, accounts, and persistent browser storage;
- reject headers that indicate payment, government identity, medical, or accessibility data;
- reject hidden control text and labels outside the WinAnsi-compatible PDF repertoire;
- reject overlong printable labels instead of truncating them;
- omit unused CSV fields, the source filename, and room identifiers from the closed-face preview;
- stop PDF generation when rows are missing, duplicated, or ambiguously mapped; and
- revoke generated object URLs when a result is replaced or the page is unloaded.

These controls do not make the source or output anonymous, encrypted, or safe to distribute. The
generated PDF contains guest-room associations on inward-folded surfaces and staff index pages.
The application does not authenticate operators, verify authorization, inspect value semantics,
scan files for malware, determine current room state, or prevent copying after download.

PDF rendering uses `pdf-lib` and its built-in Helvetica StandardFonts in browser memory. It does not
upload source data to a conversion provider or request a remote font.

Read [privacy and safety limits](docs/key-packet-press/privacy-safety-limits.md) before operational
use.
