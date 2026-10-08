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

Bibliography, footnote and short display must retain the same title and contributor
identities. Periods within personal initials are not title boundaries; numeric
title dates are not source-page markers. Derived fields refresh with a corrected
bibliography only while still automatically filled; manual edits remain intact.
Run the PDF-free formatter checks with `node --test test-citation-metadata.cjs`.
An explicit editor/translator role supplies a name/title boundary. Unmarked,
ambiguous names still need review; comma-and phrases alone cannot establish it.
These checks do not establish fresh AI metadata-reading accuracy.

Only an AI metadata response may auto-fill the citation. Missing, failed or
legacy heuristic responses leave a visible warning and editable metadata;
chapter-link generation still works. The browser no longer assembles a guessed
citation from a PDF's potentially garbled hidden text layer.

## Chapter PDF filenames

For volumes of the same multi-volume work (for example, Wesley's collected
works), the existing metadata scan observes the common work title and this
volume's designation. The editable filename label produces names such as
`Volume 19 — The Works of John Wesley — Introduction.pdf`. Volume leads so it
survives shortening an unusually long filename. Publisher-series
numbers on distinct books (for example WUNT) do not qualify. Missing observations
leave the label empty; do not guess from the source filename or bibliography.
The label resets for the next book; manual changes remain for the same book.

Only newly generated chapter tokens carry this optional filename. Existing links,
citation fields, chapter labels/ranges and Dropbox originals are unchanged.
The label does not grant downloads: the generator still signs no-download patron
links, and the reader keeps those restrictions. Where saving is allowed, PDF.js
uses the Worker's filename header. Publishing this change requires both the
streaming Worker and this generator; neither ToC service nor the original reader
is involved. Offline tests cover the handoff, not fresh model-reading accuracy.
