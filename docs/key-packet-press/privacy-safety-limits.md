# Privacy and safety limits

## Data boundary

Key Packet Press reads the selected CSV with the browser File API, builds the packet model in
memory, and creates the PDF as an in-memory Blob. The application source does not initiate an API,
telemetry, account, analytics, conversion-provider, or remote-font request and does not write
cookies, local storage, session storage, IndexedDB, or a server-side record.

Static JavaScript, CSS, and the PDF library still have to be delivered by whatever local or future
web server hosts the application. PDF generation itself uses `pdf-lib` built-in Helvetica
StandardFonts in browser memory. “Local processing” means the rooming-list contents are not
intentionally uploaded by the application; it is not a claim that the browser or hosting
environment is trusted.

## Information retained in output

The generated PDF intentionally contains:

- the guest or party label;
- the supplied room identifier;
- the CSV source row;
- a generated timestamp; and
- a packet sequence.

Room identifiers are omitted from the browser's closed-face preview and the printed exterior. They
remain on the inward-folded surface and the staff assembly index. Folding is an exposure-reduction
measure, not encryption or access control.

The PDF:

- is not password-protected or encrypted;
- can be copied, forwarded, cached, backed up, or printed by the browser and operating system;
- is outside application control after download; and
- should be handled as sensitive operational material.

Remove the index before guest handoff. Secure or destroy it after arrival. Reprint all affected
materials after any room move.

## Input guards and their limits

The parser rejects headers associated with payment, government identity, medical, and accessibility
details. It also rejects hidden controls, unsupported characters, and unsafe layout lengths and
blocks output on missing, duplicate, or ambiguous mappings.

These controls have important limits:

- Sensitive-header detection is pattern-based, not semantic data classification.
- A misleading benign header can still contain sensitive values that the application reads into
  browser memory before ignoring the column.
- Sensitive content placed directly in the guest or room column may be printed if it satisfies the
  structural rules.
- The application does not inspect a file for malware or formula intent.
- The 2 MiB and 2,000-row bounds reduce accidental load; they are not a denial-of-service proof.
- WinAnsi-compatible character checks are a PDF rendering allowlist, not a language, identity, or
  spoofing guarantee. Unsupported values are rejected rather than transliterated.

Use a minimized export containing only the intended guest or party and room columns whenever
possible. Never provide payment data, identity documents, medical notes, accessibility notes,
credentials, or full reservation records.

## Operational limits

Key Packet Press does not:

- prove that a supplied room is current, vacant, clean, safe, or assigned;
- update itself when a room changes;
- connect to a PMS or lock provider;
- encode, activate, revoke, or verify a key;
- verify the operator's authority or the guest's identity;
- prevent a packet from being handed to the wrong person;
- replace hotel access-control, identity-verification, or incident-response procedures; or
- provide a privacy, security, accessibility, legal, or regulatory compliance guarantee.

The timestamp describes when the PDF was generated, not when the source was finalized or when the
room mapping was verified.

## Browser and dependency limits

The browser, local machine, extensions, print spooler, download directory, backups, and hosting
origin are outside the application's control. A compromised dependency or delivery origin could
break the local-processing promise. Lockfile review, dependency auditing, static source checks, and
release integrity verification are therefore part of the release process, but final release
evidence is still pending.

The PDF module is lazy-loaded from the application's own origin after a CSV passes review. The
built-in StandardFonts require no separate font request, but lazy loading and local generation are
not security boundaries.

## Safer operating checklist

1. Export the smallest finalized CSV containing only guest or party and room columns.
2. Use synthetic data for evaluation, screenshots, bug reports, and development.
3. Run the application from a trusted origin and device.
4. Review the closed-face preview and the staff index before printing.
5. Fold room identifiers inward before staging packets.
6. Remove the index before handoff and secure or destroy it after arrival.
7. Reprint after every room move.
8. Delete downloaded and printed artifacts according to the property's approved retention policy.
