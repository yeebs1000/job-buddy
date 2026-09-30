# V1 beta 7: Local resume import

## Use it

Open **Profile → Import resume**. Choose a text-based PDF or DOCX, or paste resume text. File selection opens the review automatically; pasted text uses **Review extracted details**.

Edit or deselect suggested name, contact details, HTTPS links, education, jobs, projects and skills. Existing conflicting contact/name/link values start unchecked. Selecting one explicitly permits replacement. **Apply selected details** updates only the profile draft; **Save profile** persists it through the existing encrypted Windows profile store. Cancelling discards the import. The profile form is disabled during review so conflicting values cannot change underneath the selection.

## Privacy and safeguards

- Parsing happens in the browser, with bundled PDF.js and fflate; no AI, API key, resume upload, external relationship fetch or OCR service.
- Original files, extracted raw text and evidence snippets are transient. Only selected structured profile values are sent to the local companion when Save profile is clicked. The parser adds no logging, analytics or browser storage.
- Authorization, sponsorship, salary and demographic answers are not inferred or mapped. Review free-text summaries for unwanted information before saving.
- Source snippets are rendered as text, never HTML. DOCX XML declarations/entities and macro or embedded binary content are rejected. Only document/header/footer XML is decompressed, in bounded chunks, with an aggregate 5 MB expanded-text cap.
- File limit: 5 MB. PDF limit: 20 pages, 15-second parsing timeout. Extracted or pasted text limit: 100,000 characters. Cancellation aborts pending PDF work; no asynchronous result applies after closing import.
- Existing collection entries remain; matching entries/skills are deduplicated. Schema/capacity validation is atomic: no partial merge or silent removal to make room.

## Honest limitations

This is a deterministic English-heading parser, not a universal resume-understanding model. Name order, columns, unusual headings, education and experience grouping need review. Unseparated entries can be grouped together; edit the suggestion or add entries manually. Phone country codes must be explicit (+65, +852 or +1); year-only dates do not invent months. No OCR, old .doc support, encrypted-PDF password entry, automatic resume attachment or AI-generated answers.

The existing profile limits remain 5 education entries, 10 jobs, 10 projects and 100 skills. Imports that exceed them stay in review until corrected. Encrypted persistence still requires the Windows local companion. This release does not change Gmail credentials, extension pairing or final-submit safeguards.

## Verification coverage

Unit tests cover extraction, source-backed suggestions, restricted fields, date/name ambiguity, deduplication, explicit conflict replacement, invalid edits, capacity overflow and malformed/oversized DOCX files. Browser tests exercise real PDF and DOCX bytes, local worker loading, editable review, no profile save until explicit confirmation, reload persistence through a test API, paste fallback, cancellation and narrow-screen layout. Fixtures are synthetic; broader real-resume acceptance testing remains important.
