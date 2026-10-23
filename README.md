# DTL Chapter Link Generator — Streaming

Separate streaming copy of the DTL chapter request URL generator for the
Dropbox-backed chapter PDF reader. Its layout, citation handling, and chapter
ranges are preserved from the original; existing generators and links are unchanged.

Original generator:
https://thedtl.github.io/chapter-request-url-generator-dropbox-lab/

This streaming version points at:

- Generator: `https://thedtl.github.io/chapter-link-generator-streaming/`
- Reader: `https://thedtl.github.io/reader-streaming/web/viewer.html`
- Worker: `https://dtl-chapter-reader-streaming.reference-dfe.workers.dev`

It reads Dropbox-backed PDFs through the streaming Worker, extracts PDF bookmarks with
PDF.js, asks the streaming Worker to sign one long-lived chapter token per chapter,
and outputs LibGuides-ready HTML for the protected chapter-only PDF viewer.
The streaming copy uses its own browser-session password storage key.

Supply an outline containing the selected reader-navigation units, including
selected nested works. A parent's range spans its whole subtree; the next usable
opening outside that subtree is included as the boundary page. Adjacent ranges
therefore overlap and may show neighboring text on a shared page. Start-only
bookmarks do not prove the exact content-end position. Invalid destinations are
skipped, not guessed. Older PDFs mixing scanner bookmarks and generated outlines
are not automatically cleaned, and no wrapper is removed by its title.

Run the focused, PDF-free range checks with `node --test test-chapter-ranges.cjs`.

## Citation formatting

Released 2026-10-23: restore surname-first for the first modern personal contributor
in Short Display, using given/family-name boundaries from the existing metadata
scan, not a last-word guess. Later contributors keep natural order; full citation,
footnote and manual Short Display edits are unchanged. Compound surnames stay
together; historical/locative, corporate, non-Latin and uncertain names are not
mechanically inverted. Only an exact matching name can use the scan's boundaries.
The scanner's title contract explicitly includes the whole subtitle. A partial
main-title match followed by a colon is no longer accepted for automatic italics;
use the existing title-selection control if the returned fields disagree.
All 43 generator and 52 Worker checks pass. Published generator source `a63b622`
byte-matches the tested HTML; scanner source `f0b27da` is live as Worker version
`4ce14a2c-770d-4504-ba69-59e0a8da6e79` at 100%. Health, missing-password rejection
and CORS pass; runtime/binding metadata is unchanged. The deployment check initially
expected 403 instead of the existing 401 authentication contract; only that check
was corrected. No extra request, fresh AI scan, PDF access or old-service change.

Released 2026-10-22: edit Citation, then **Update HTML** to refresh
every output part and the preview using the existing chapter links. Copy also
refreshes a changed citation before copying. Replace the old HTML in LibGuides;
the generator cannot change HTML already pasted elsewhere. No PDF rescan, token
signing or metadata request is needed. Changed source URLs require generation
for the new book, and New Book clears the old link context.

Manual citation text is preserved, including edits made during an in-flight scan;
HTML escapes it; title italics now use the separately scanned or staff-selected
title span, not citation parsing (see the update below).
Manually edited footnote/short-display fields stay unchanged. Removed last-word
surname inversion and speculative initial/particle-name repairs (including the
old hardcoded de Vries repair): these tried to fix past errors but could corrupt
valid names. Compound surnames and historical/locative names retain their supplied
boundaries. Ambiguous multi-author footnotes preserve the creator heading rather
than merge people; they remain editable. Scanner warnings now reach the form.
34 PDF-free generator tests and a synthetic browser edit/update/New Book check
pass. These checks do not establish fresh AI reading accuracy or scan latency.
Published source `dc96446` exactly matches the tested HTML. Streaming scanner
source `90ce3bc` is live as Worker version `85fb013d-0e71-43fb-b0b3-379899a00728`.
All 80 generator/Worker checks pass, including chapter transport/access controls.
Health/auth/CORS pass; runtime and binding metadata are unchanged. No fresh AI
scan, PDF access or changes to the original generator, reader or ToC services.

Released 2026-10-14: enforce consistent Chicago notes-and-bibliography volume and
edition abbreviations in the existing formatter: `vol. 8`, `vol. 2A`, `Vol. 8`
at a sentence boundary, `2nd ed.`, and `20th anniversary ed.` Letter suffixes
are optional, never invented or dropped. No volume observation means no volume
or missing-volume notice; URLs/filenames no longer supply a short-display-only
volume. A suffix such as `2A.` is not a personal initial, so the series stays
outside the footnote's publication parentheses. Tests retain author/translator
roles, real title words, title italics/roman series, and manual derived-field edits.
The patron short display remains an identification line, not a formal shortened
footnote. See [Chicago's citation guide](https://www.chicagomanualofstyle.org/tools_citationguide/citation-guide-1.html).
These formatting checks do not certify every possible citation or repair bad readings.
Generator source `b68b45e` and Worker source `a7c88be` are deployed; Worker version
`6a44742e-aa81-4ee5-abdc-5c99d1d101c0` serves 100%. All 67 offline checks pass.
Published HTML matches the tested source, its formatter passes ordinary/lettered/
missing-volume checks, and the filename box is absent. Health/auth/CORS pass;
runtime and bindings are unchanged. No fresh AI scan or ToC-service update.

Bibliography, footnote and short display must retain the same title and contributor
identities. Periods within personal initials are not title boundaries; numeric
title dates are not source-page markers. Derived fields refresh with a corrected
bibliography only while still automatically filled; manual edits remain intact.
Run the PDF-free formatter checks with `node --test test-citation-metadata.cjs`.
An explicit editor/translator role supplies a name/title boundary. Unmarked,
ambiguous names still need review; comma-and phrases alone cannot establish it.
These checks do not establish fresh AI metadata-reading accuracy.

Released 2026-10-14: format the supplied contributor
role instead of guessing translator status from a same-name responsibility or
a known title. The old inference and duplicate-credit removal reproduced Moore's
incorrect `trans.` and erased his introduction/notes credit. Remove those
assumptions; preserve explicit translator/editor and compound responsibilities.
The metadata reader decides commentary authorship from visible context. No
volume or missing-volume notice is added when the scan supplies none. Original
generators, saved citations and manual edits are unchanged.
That earlier release used generator source `c933331` and streaming Worker version
`87e3900b-521e-4a17-96b9-30e3b5bb08b1`. All 66 offline checks passed;
published HTML byte-matches the tested file and its served formatter produces
`Moore, Carey A. Esther. The Anchor Bible.` Health/authentication/CORS pass.
No new AI scan was run; refresh the page before a new scan. Existing saved
citations are not retroactively rewritten.

Only an AI metadata response may auto-fill the citation. Missing, failed or
legacy heuristic responses leave a visible warning and editable metadata;
chapter-link generation still works. The browser no longer assembles a guessed
citation from a PDF's potentially garbled hidden text layer.

The generator has no chapter-PDF filename label. New links carry chapter titles
and page ranges only; this does not change existing links or the ToC Creator's
separate full-book PDF naming rules. Bibliographic volume details remain part
of the citation.

## Title italics — 2026-10-22 update

Use the existing scanner's separately supported title, only when it matches one
exact span of the displayed citation. Missing, mismatched or repeated titles
stay plain; never infer italics from author punctuation. Staff can highlight
the title in Citation, click **Use selected text as title**, then **Update HTML**,
or use **Clear italics**. Copy also applies pending changes to all HTML parts.
Edits outside the title retain its span; changes inside or at an ambiguous title
boundary clear it for reselection. New Book clears it, and another source cannot
reuse it. Escaping preserves manual text, and chapter URLs/ranges stay unchanged.
No extra AI calls, PDF reads, signing requests, storage or model changes.
39 generator checks and a synthetic browser select/clear/update check pass;
these verify formatting, not fresh metadata-reading accuracy.
Deployed source `1f50bd0` byte-matches GitHub Pages. Worker source `20c3569`
is live as `891fec3a-d1a9-4834-89dc-ffa05e8f3b27` at 100%. All 88 combined
checks pass; health/auth/CORS pass and runtime/binding metadata is unchanged.
Browser clear/select/update/New Book checks used synthetic data only.

Bibliography preview: a small live preview below Citation uses the exact same
escaped title-span formatter as the copied HTML. It updates on typing, scan
results, title selection/clearing and New Book, before any links are generated.
It loads no PDF and makes no request. Update HTML still refreshes generated
parts; Copy also applies pending edits. 40 generator checks pass.
