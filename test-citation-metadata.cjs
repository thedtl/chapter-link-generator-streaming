const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Run the shipped formatting functions without a browser, network, or PDF read.
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const source = html.slice(html.indexOf('        const WORKER_URL'), html.lastIndexOf('</script>'));
function formatter() {
    const fields = {};
    const document = {
        addEventListener() {},
        getElementById(id) {
            return fields[id] ||= { value: '', addEventListener(type, fn) { this[type] = fn; } };
        },
        createElement() {
            return {
                innerHTML: '',
                get textContent() { return this.innerHTML.replace(/<[^>]*>/g, ''); },
                set textContent(text) { this.innerHTML = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
            };
        }
    };
    const context = vm.createContext({ document, pdfjsLib: { GlobalWorkerOptions: {} } });
    vm.runInContext(source, context);
    return { context, fields };
}

const reportedBibliography = 'Ward, W. Reginald, and Richard P. Heitzenrater, eds. Journal and Diaries II (1738–43). The Bicentennial Edition of the Works of John Wesley, vol. 19. Nashville: Abingdon Press, 1990.';

test('complete editor names, dated title, and series volume survive all citation formats', () => {
    const { context: c } = formatter();
    assert.equal(c.normalizeBibliographyCitation(reportedBibliography), reportedBibliography);
    const parts = c.parseBibliographyCitation(reportedBibliography);
    assert.equal(parts.authorText, 'Ward, W. Reginald, and Richard P. Heitzenrater, eds');
    assert.equal(parts.titleText, 'Journal and Diaries II (1738–43)');
    const variants = c.buildCitationVariantsFromBibliography(reportedBibliography);
    assert.equal(variants.footnote, 'W. Reginald Ward and Richard P. Heitzenrater, eds., Journal and Diaries II (1738–43), The Bicentennial Edition of the Works of John Wesley, vol. 19 (Nashville: Abingdon Press, 1990).');
    assert.equal(variants.short, 'Ward, W. Reginald, and Richard P. Heitzenrater, eds. Journal and Diaries II (1738–43), vol. 19');
    assert.match(c.formatCitationHtml(reportedBibliography), /<em>Journal and Diaries II \(1738–43\)<\/em>/);
});

test('explicit contributor roles keep complete names together before the title', () => {
    const { context: c } = formatter();
    for (const author of ['Ward, W. Reginald, ed', 'Smith, J. Paul, trans', 'Smith, J. Paul, and Mary Jones, eds', 'Smith, J. Paul, comp']) {
        const bibliography = `${author}. Collected Letters (1848). London: Example Press, 1990.`;
        const parts = c.parseBibliographyCitation(bibliography);
        assert.equal(parts.authorText, author);
        assert.equal(parts.titleText, 'Collected Letters (1848)');
        for (const variant of [c.normalizeBibliographyCitation(bibliography), ...Object.values(c.buildCitationVariantsFromBibliography(bibliography))]) {
            assert.ok(variant.includes('Collected Letters (1848)'), variant);
        }
    }
});

test('authors ending in initials keep the existing boundary handling', () => {
    const { context: c } = formatter();
    for (const author of ['Smith, J.', 'Lewis, C. S.', 'Robinson, Haddon W.']) {
        for (const title of ['The History of Reading', 'Miracles']) {
            const bibliography = `${author} ${title}. London: Example Press, 1990.`;
            const parts = c.parseBibliographyCitation(bibliography);
            assert.equal(parts.authorText, author);
            assert.equal(parts.titleText, title);
            assert.ok(c.buildCitationVariantsFromBibliography(bibliography).short.includes(title));
        }
    }
});

test('titles followed by publication details are not absorbed into authors ending in initials', () => {
    const { context: c } = formatter();
    for (const author of ['Smith, J.', 'Smith, John R.']) {
        for (const title of ['Faith, Hope, and Love', 'Reading, Writing, and Learning', 'Miracles']) {
            for (const details of ['', 'Vol. 2. ', '2nd ed. ', 'Example Library 3. ', 'Studies in Theology 3. ']) {
                const bibliography = `${author} ${title}. ${details}London: Example Press, 1990.`;
                const parts = c.parseBibliographyCitation(bibliography);
                assert.equal(parts.authorText, author);
                assert.equal(parts.titleText, title);
                assert.equal(c.normalizeBibliographyCitation(bibliography), bibliography);
                const variants = c.buildCitationVariantsFromBibliography(bibliography);
                assert.ok(variants.short.includes(title), variants.short);
                assert.ok(variants.footnote.includes(title), variants.footnote);
            }
        }
    }
});

test('explicit page markers are removed while title years and bracketed publication years remain', () => {
    const { context: c } = formatter();
    assert.equal(c.cleanFrontMatterLine('Collected Letters (1848). London: Example Press, [1990].'), 'Collected Letters (1848). London: Example Press, [1990].');
    assert.equal(c.cleanFrontMatterLine('Collected Letters (Page 4).'), 'Collected Letters.');
    assert.equal(c.cleanFrontMatterLine('Collected Letters [p. 4].'), 'Collected Letters.');
});

test('bibliography edits refresh automatic variants while preserving manual variant edits', () => {
    const { context: c, fields } = formatter();
    c.fillDerivedCitationFields(reportedBibliography);
    const corrected = 'Wesley, John. Journal and Diaries II (1738–43). Vol. 19. Nashville: Abingdon Press, 1990.';
    fields.citation.value = corrected;
    fields.citation.change.call(fields.citation);
    assert.equal(fields.footnoteCitation.value, c.buildCitationVariantsFromBibliography(corrected).footnote);
    assert.equal(fields.shortCitation.value, c.buildCitationVariantsFromBibliography(corrected).short);
    fields.shortCitation.value = 'My edited display line';
    c.fillDerivedCitationFields(reportedBibliography);
    assert.equal(fields.footnoteCitation.value, c.buildCitationVariantsFromBibliography(reportedBibliography).footnote);
    assert.equal(fields.shortCitation.value, 'My edited display line');
    fields.footnoteCitation.value = 'My edited footnote';
    c.fillDerivedCitationFields(corrected);
    assert.equal(fields.footnoteCitation.value, 'My edited footnote');
    assert.equal(fields.shortCitation.value, 'My edited display line');
});

test('existing metadata read carries multi-volume work label to signed chapter filenames only', async () => {
    const { context: c, fields } = formatter();
    let reads = 0;
    c.showStatus = c.showCitationNote = () => {};
    c.getCitationPageNumbers = () => [1, 2];
    c.extractFrontMatterLines = async () => [];
    c.renderFrontMatterImages = async () => [];
    c.requestHeadingSuggestion = async () => {
        reads++;
        return { heading: reportedBibliography, source: 'ai',
            downloadVolume: { title: 'The Works of John Wesley', designation: 'Volume 19' } };
    };
    await c.fillCitationFromPdfIfNeeded({}, 'synthetic-password', 'book-19');
    assert.equal(reads, 1);
    assert.equal(fields.downloadPrefix.value, 'Volume 19 — The Works of John Wesley');
    const chapter = { title: 'Introduction', start: 8, end: 14 };
    assert.equal(JSON.stringify(c.chapterSigningRecords([chapter])), JSON.stringify([{
        ...chapter, filename: 'Volume 19 — The Works of John Wesley — Introduction.pdf'
    }]));
    assert.equal(fields.citation.value, reportedBibliography);
    assert.match(html, /chapters: chapterSigningRecords\(chapters\),\s*download: false/);
});

test('publisher series, unknown volume and ordinary books keep their old filename behavior', () => {
    const { context: c } = formatter();
    const chapter = { title: 'Reading in Context', start: 5, end: 20 };
    for (const volume of [null, undefined, {}, { title: 'A Work' }, { designation: 'Volume 3' }]) {
        c.fillDownloadPrefix(volume);
        assert.equal(JSON.stringify(c.chapterSigningRecords([chapter])), JSON.stringify([chapter]));
    }
    // A publisher series in the citation/source is not a multi-volume work observation.
    c.fillDerivedCitationFields('Smith, John. A Distinct Book. WUNT, vol. 300. London: Press, 2020.', 'WUNT-Volume-300.pdf');
    assert.equal(JSON.stringify(c.chapterSigningRecords([chapter])), JSON.stringify([chapter]));
});

test('manual download labels survive the same book but cannot carry into the next one', () => {
    const { context: c, fields } = formatter();
    c.prepareDownloadPrefix('book-19');
    c.fillDownloadPrefix({ title: 'Collected Works', designation: 'Tome XIX' });
    assert.equal(fields.downloadPrefix.value, 'Tome XIX — Collected Works');
    fields.downloadPrefix.value = '';
    c.fillDownloadPrefix({ title: 'Collected Works', designation: 'Tome XIX' });
    assert.equal(fields.downloadPrefix.value, '', 'clearing the label is a manual opt-out');
    fields.downloadPrefix.value = 'My chosen volume label';
    c.prepareDownloadPrefix('book-19');
    c.fillDownloadPrefix({ title: 'Another suggestion', designation: 'Volume 19' });
    assert.equal(fields.downloadPrefix.value, 'My chosen volume label');
    c.prepareDownloadPrefix('different-book');
    assert.equal(fields.downloadPrefix.value, '');
    c.fillDownloadPrefix({ title: '전집', designation: '제2권' });
    assert.equal(fields.downloadPrefix.value, '제2권 — 전집');
    c.clearCitationAutoFillState();
    assert.equal(fields.downloadPrefix.value, '');
});
