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
