# V1 beta 8: Resume layout fixes

The first parser passed simplified fixtures but failed a real Word-exported PDF. These fixes address the reproduced failures, not a claim of universal resume understanding.

- Reconstruct PDF lines using baselines and horizontal gaps; ignore empty EOL markers instead of adding duplicate paragraph breaks. Join adjacent word fragments without inserting spurious spaces, and retain widely separated columns as tabs.
- Keep institution/employer text when dates share the same row. Group entries by organisation headers, date ranges and role headings instead of treating every blank line as a new entry.
- Keep responsibility bullets and wrapped continuations in summaries, never as standalone jobs. Apply collection limits after recognising entries.
- Accept Sep, Sept and September, including dotted month abbreviations. Preserve full month precision; year-only ranges still do not invent months.
- Split explicitly delimited degree/field-of-study details. Flag expected education completion dates in review; the existing Profile date field itself does not store an expected/completed status.
- Group bullet-led projects and stop at combined Skills, Languages & Interests headings. Languages and interests are not silently imported as technical skills.

## Repair a previous import

Import the resume again. In **Correct a previous import**, check only the education, experience or projects sections you want to replace. All existing entries in those checked sections are replaced by their selected suggestions when you Apply. Unchecked sections remain; replacement never happens by default. No selected suggestions for a section means it is not replaced. Empty replacement entries are rejected. Review the resulting draft and explicitly Save profile. Cancelling the import or a validation error leaves the original draft unchanged.

The user's saved profile is not automatically migrated or rewritten. All contact/conflict safeguards and local-only processing remain in place. No source resume or private extracted text is committed; regression fixtures use fictional content.

## Validation and remaining limits

Regression cases cover right-aligned organisation/date rows, Word EOL markers, split word fragments, wrapped bullets, five experience entries, three projects, combined headings, expected dates, entry replacement and preservation of other sections. Browser tests use an actual generated PDF with separately positioned left/right text and exercise Apply/Save through the profile UI. The supplied real PDF was also checked locally against the extracted education, experience and project mappings without saving the profile.

Unusual multi-column reading order, ambiguous names, implicit phone-country codes and non-English headings still require review. Student leadership stays in the section where the resume lists it; the parser does not certify it as paid employment. Uploaded files remain temporary; no AI service or remote parsing is introduced.
