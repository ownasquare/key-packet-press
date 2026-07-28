# Data contract

## Input envelope

| Property | Contract |
|---|---|
| File count | Exactly one file per attempt |
| File recognition | `.csv` extension, `text/csv`, or `application/csv` |
| Encoding | Strict UTF-8; one leading UTF-8 BOM is removed |
| Maximum size | 2 MiB at the File and decoded-text boundaries |
| Delimiter | Comma |
| Maximum data records | 2,000 parsed records after the header; blank records count toward this cap |
| Blank records | Fully blank data records are ignored after the cap check |
| Required roles | Exactly one guest/party column and exactly one room column |

The parser supports quoted fields, escaped double quotes, CRLF or LF records, and line breaks inside
quoted fields. Malformed quote transitions fail the entire file. A notice's source row is the
physical line on which its CSV record begins.

## Header matching

Headers are trimmed, lowercased, and normalized by replacing punctuation and whitespace runs with
one space.

| Role | Normalized aliases |
|---|---|
| Guest or party | `guest`, `guest name`, `name`, `packet name`, `party`, `party name` |
| Room | `room`, `room id`, `room no`, `room number` |

This means forms such as `GUEST_NAME`, `room-number`, and ` room...no ` match. More than one matching
column for either role is an error; the application does not choose one.

Additional columns are not returned in `RoomingListResult`, the packet model, or the PDF. Before
discarding them, the parser rejects normalized headers that indicate:

- payment, credit or debit card, CVV/CVC, banking, routing, or billing data;
- passport, government or national ID, driver's license, Social Security, or tax ID data;
- medical, health, diagnosis, medication, or allergy data; or
- accessibility, access-needs, special-needs, disability, or ADA-note data.

This is header-pattern screening only. It does not classify the semantic content of every cell.

## Value handling

Guest and room values are trimmed at the beginning and end. Internal spelling, punctuation,
whitespace, leading zeros, and line breaks are otherwise preserved for display.

The application does not:

- infer a person or party identity;
- merge similar labels;
- correct spelling;
- normalize room semantics;
- truncate overlong values; or
- transliterate unsupported writing systems.

### Bounds

| Value | Code-point maximum | Line maximum |
|---|---:|---:|
| Guest or party label | 28 | 3 |
| Room identifier | 11 | 2 |

These caps guarantee that the widest accepted WinAnsi glyph fits the staff index at its 8-point
minimum size: 28 glyphs fit the 232-point guest column, and 11 fit the 94-point room column.

PDF text uses `pdf-lib`'s built-in Helvetica StandardFonts and their WinAnsi encoding. Printable
labels are therefore limited to:

- printable ASCII `U+0020–U+007E`;
- Latin-1 `U+00A0–U+00FF`; and
- the defined Windows-1252 extensions `U+20AC`, `U+201A`, `U+0192`, `U+201E`, `U+2026`, `U+2020`,
  `U+2021`, `U+02C6`, `U+2030`, `U+0160`, `U+2039`, `U+0152`, `U+017D`, `U+2018`, `U+2019`,
  `U+201C`, `U+201D`, `U+2022`, `U+2013`, `U+2014`, `U+02DC`, `U+2122`, `U+0161`, `U+203A`,
  `U+0153`, `U+017E`, and `U+0178`.

CR `U+000D` and LF `U+000A` are allowed within quoted labels and count toward the line limit. Other
C0/C1 controls, tab, Arabic letter mark, directional marks, bidirectional
embeddings/overrides/isolates, and every printable code point outside the repertoire above are
rejected. For example, `U+0100` fails closed. The app does not normalize, transliterate, or replace
an unsupported character.

## Review rules

Rows with a missing required value produce row-specific notices and are excluded from candidate
packets. Candidate rows are compared using a key that:

1. trims surrounding whitespace;
2. collapses internal whitespace runs to one space; and
3. lowercases the result.

Every occurrence is cited when:

- the normalized guest and normalized room pair repeats; or
- one normalized guest label appears with more than one normalized room.

Different guest labels may share the same supplied room. The application does not decide which
duplicate or ambiguous row is authoritative. Any notice blocks the complete PDF.

## Ordering

Ready packets sort by:

1. supplied room using a deterministic natural order for ASCII digit runs;
2. lowercased guest or party label by Unicode code point; and
3. source row.

Numeric runs compare without converting them to JavaScript numbers, preserving deterministic
behavior for long identifiers and leading zeros. No browser locale collation is used.

## Parsed and document models

The parser returns:

```ts
type RoomingListResult = {
  notices: ReviewNotice[];
  packets: {
    sourceRow: number;
    guestLabel: string;
    roomLabel: string;
  }[];
  sourceRowCount: number;
};
```

Returned structures are deeply frozen. With no notices, the document-model step assigns stable
one-based sequences and an injected ISO generation time:

```ts
type PacketDocumentModel = {
  generatedAtIso: string;
  inserts: {
    guestLabel: string;
    roomLabel: string;
    sequence: number;
    sourceRow: number;
  }[];
  sourceRowCount: number;
};
```

## PDF output contract

- Packet identifiers use `KP-001`, `KP-002`, and so on.
- Four inserts fit on each insert page.
- Up to 20 rows fit on each staff-index page.
- Index pages follow all insert pages.
- The filename is `key-packets-YYYY-MM-DD.pdf`, using the UTC date in `generatedAtIso`.
- PDF metadata title is `Key Packet Press — Internal packet materials`.
- PDF metadata subject is `Fold-in key-packet inserts and staff-only assembly index`.
- Text is rendered with `StandardFonts.Helvetica` and `StandardFonts.HelveticaBold`.
- The source filename and discarded columns are omitted.

The generated PDF is an artifact of the supplied list at the printed generation time. It is not
evidence that a room is current.
