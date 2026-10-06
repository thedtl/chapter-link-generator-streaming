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
