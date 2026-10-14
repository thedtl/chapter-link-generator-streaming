const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Run the shipped formatting functions without a browser, network, or PDF read.
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const source = html.slice(html.indexOf('        const VIEWER_URL'), html.lastIndexOf('</script>'));
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

test('edited-book title, subtitle and both editors survive all three display lines', () => {
    // Reviewer transcription from God Who Creates PDF 3–4, not fresh AI output.
    const { context: c } = formatter();
    const citation = 'Brown, William P., and S. Dean McBride Jr., eds. God Who Creates: Essays in Honor of W. Sibley Towner. Grand Rapids: William B. Eerdmans Publishing Company, 2000.';
    const bibliography = c.normalizeBibliographyCitation(citation);
    const { footnote, short } = c.buildCitationVariantsFromBibliography(bibliography);
    for (const display of [bibliography, footnote, short]) {
        assert.match(display, /God Who Creates: Essays in Honor of W\. Sibley Towner/);
        assert.match(display, /Brown/);
        assert.match(display, /S\. Dean McBride Jr/);
        assert.doesNotMatch(display, /BBovx|1989|Edited by\./);
    }
    assert.match(footnote, /^William P\. Brown and S\. Dean McBride Jr\., eds\.,/);
});

test('commentary author remains the author without an invented volume or translator role', () => {
    const { context: c } = formatter();
    // Visible title-page words supplied by the user, not a fresh model reading.
    const citation = 'Moore, Carey A. Esther. The Anchor Bible.';
    assert.equal(c.normalizeBibliographyCitation(citation), citation);
    const variants = c.buildCitationVariantsFromBibliography(citation);
    assert.equal(variants.footnote, 'Carey A. Moore, Esther, The Anchor Bible.');
    assert.equal(variants.short, 'Moore, Carey A. Esther');
});

test('composite scholarly responsibilities are neither translator-only nor discarded', () => {
    const { context: c } = formatter();
    for (const credit of ['Introduction, translation, and notes by Carey A. Moore', 'Translation and commentary by Carey A. Moore', 'Translated and edited by Carey A. Moore', 'Translation and commentary']) {
        const citation = `Moore, Carey A. Esther. ${credit}. The Anchor Bible.`;
        assert.equal(c.normalizeBibliographyCitation(citation), citation);
        const variants = c.buildCitationVariantsFromBibliography(citation);
        assert.ok(variants.footnote.includes(credit), variants.footnote);
        assert.equal(variants.short, 'Moore, Carey A. Esther');
        assert.doesNotMatch(variants.footnote, /\btrans\./);
    }
    const titleFirst = 'Esther. Introduction, translation, and notes by Carey A. Moore. Garden City: Doubleday, 1971.';
    assert.equal(c.normalizeBibliographyCitation(titleFirst), titleFirst);
    assert.equal(c.parseBibliographyCitation(titleFirst).authorText, '');
});

test('explicit commentary and compound contributor roles retain their meaning', () => {
    const { context: c } = formatter();
    for (const [role, expected] of [['commentator', 'comm.'], ['translator and commentator', 'trans. and comm.'], ['commentator and translator', 'comm. and trans.'], ['trans. and comm.', 'trans. and comm.']]) {
        const citation = `Smith, J. Alex, ${role}. A Commentary. London: Example Press, 2000.`;
        const bibliography = c.normalizeBibliographyCitation(citation);
        const variants = c.buildCitationVariantsFromBibliography(bibliography);
        for (const display of [bibliography, variants.footnote, variants.short]) {
            assert.ok(display.includes(expected), display);
            assert.ok(display.includes('J. Alex'), display);
            assert.ok(display.includes('A Commentary'), display);
        }
    }
});

test('genuine translations and edition responsibilities survive without role inference', () => {
    const { context: c } = formatter();
    const controls = [
        ['Rice, Howard. The Pastor as Spiritual Guide. Translated by Choi Dae-hyung. Seoul: Example Press, 2000.', 'Translated by Choi Dae-hyung', 'trans. Choi Dae-hyung'],
        ['Bonaventure. Itinéraire de l’esprit jusqu’en Dieu. Introduction, notes et glossaire par Laure Solignac, traduction par André Ménard. Paris: Vrin, 2019.', 'Introduction, notes et glossaire par Laure Solignac, traduction par André Ménard', 'traduction par André Ménard'],
        ['Wesley, John. Journal and Diaries II (1738–43). Edited by W. Reginald Ward and Richard P. Heitzenrater. Nashville: Abingdon Press, 1990.', 'Edited by W. Reginald Ward and Richard P. Heitzenrater', 'ed. W. Reginald Ward and Richard P. Heitzenrater'],
    ];
    for (const [citation, bibliographyCredit, footnoteCredit] of controls) {
        assert.ok(c.normalizeBibliographyCitation(citation).includes(bibliographyCredit));
        assert.ok(c.buildCitationVariantsFromBibliography(citation).footnote.includes(footnoteCredit));
    }
    const titleFirst = 'Confessions. Translated by Alex Smith. London: Example Press, 2000.';
    assert.match(c.parseBibliographyCitation(titleFirst).authorText, /Alex Smith, trans\./);
    assert.match(c.buildCitationVariantsFromBibliography(titleFirst).footnote, /Alex Smith, trans\./);
});

test('a familiar title cannot override an explicit editor or supply a missing role', () => {
    const { context: c } = formatter();
    for (const role of ['', ', ed.', ', trans.']) {
        const citation = `Matt, Daniel C.${role} The Zohar. Pritzker Edition. Stanford: Stanford University Press, 2011.`;
        const displays = [c.normalizeBibliographyCitation(citation), ...Object.values(c.buildCitationVariantsFromBibliography(citation))];
        for (const display of displays) {
            if (role) assert.ok(display.includes(role.slice(2)), display);
            if (role !== ', trans.') assert.doesNotMatch(display, /\btrans\./);
        }
    }
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

test('metadata fills citations without a chapter-filename control or filename token field', async () => {
    const { context: c, fields } = formatter();
    let reads = 0;
    const notes = [];
    c.showStatus = () => {};
    c.showCitationNote = (message, type) => notes.push({ message, type });
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
    assert.doesNotMatch(html, /downloadPrefix|Multi-volume work label for chapter PDF filenames/);
    assert.equal(fields.downloadPrefix, undefined);
    const chapter = { title: 'Introduction', start: 8, end: 14 };
    assert.equal(JSON.stringify(c.chapterSigningRecords([{ ...chapter, filename: 'Old filename.pdf' }])), JSON.stringify([chapter]));
    assert.equal(fields.citation.value, reportedBibliography);
    assert.equal(fields.footnoteCitation.value, c.buildCitationVariantsFromBibliography(reportedBibliography).footnote);
    assert.equal(fields.shortCitation.value, c.buildCitationVariantsFromBibliography(reportedBibliography).short);
    assert.match(notes.at(-1).message, /page images/);
    assert.equal(notes.at(-1).type, 'success');
    assert.match(html, /chapters: chapterSigningRecords\(chapters\),\s*download: false/);
});

test('unavailable or non-AI scans cannot silently become text-layer citations', async () => {
    const garbled = 'BBovx, P. Creates. Edited by. S. E., Grand RaPids: o Wm. B. Eerdmans Publishing Co, 1989.';
    for (const response of [
        { source: 'heuristic', heading: garbled },
        { source: 'none', heading: '' },
        { source: 'unavailable', heading: '', note: 'Metadata service unavailable.' },
        { source: 'worker', heading: garbled },
        { heading: garbled },
        { source: 'ai', heading: '' }
    ]) {
        const { context: c, fields } = formatter();
        const notes = [];
        c.showStatus = () => {};
        c.showCitationNote = (message, type) => notes.push({ message, type });
        c.getCitationPageNumbers = () => [1];
        c.extractFrontMatterLines = async () => [{ text: garbled, pageNumber: 1, fontSize: 24 }];
        c.renderFrontMatterImages = async () => [];
        c.requestHeadingSuggestion = async () => response;
        const citation = await c.fillCitationFromPdfIfNeeded({}, 'synthetic-password', 'source-book');
        assert.equal(citation, 'Citation needed', JSON.stringify(response));
        assert.equal(fields.citation.value, citation);
        assert.equal(notes.at(-1).type, 'error');
        assert.match(notes.at(-1).message, /Chapter links will still be generated/);
        assert.match(notes.at(-1).message, /enter or correct the citation fields/);
        const parts = c.splitIntoParts(citation, [{ title: 'Chapter', start: 1, end: 2 }], [{ token: 'synthetic-token' }]);
        assert.equal(parts.length, 1);
        assert.match(parts[0].html, /synthetic-token/);
        assert.doesNotMatch(parts[0].html, /BBovx/);
    }
});

test('network and Worker errors return an explicit unavailable scan, not guessed metadata', async () => {
    const { context: c } = formatter();
    for (const fetch of [
        async () => { throw new Error('offline'); },
        async () => ({ ok: false, json: async () => ({ error: 'unavailable' }) })
    ]) {
        c.fetch = fetch;
        const result = await c.requestHeadingSuggestion('synthetic-password', [], []);
        assert.equal(result.source, 'unavailable');
        assert.equal(result.heading, '');
        assert.match(result.note, /could not be reached or returned an error/);
    }
});

test('manual bibliography and derived-field edits bypass the scan and remain usable', async () => {
    const { context: c, fields } = formatter();
    c.showCitationNote = () => {};
    c.requestHeadingSuggestion = async () => assert.fail('must not scan over manual metadata');
    fields.citation.value = reportedBibliography;
    c.document.getElementById('footnoteCitation').value = 'My footnote';
    c.document.getElementById('shortCitation').value = 'My short display';
    assert.equal(await c.fillCitationFromPdfIfNeeded({}, 'synthetic-password', 'book'), reportedBibliography);
    assert.equal(fields.citation.value, reportedBibliography);
    assert.equal(fields.footnoteCitation.value, 'My footnote');
    assert.equal(fields.shortCitation.value, 'My short display');
});

test('ordinary and lettered volumes use the same CMS abbreviation in every display', () => {
    const { context: c } = formatter();
    for (const [observed, number] of [['8', '8'], ['2A', '2A'], ['6E', '6E'], ['25B', '25B'], ['IV', '4'], ['twenty-one', '21'], ['2A–2B', '2A–2B']]) {
        const supplied = `Smith, Alex. A Commentary. Example Series, volume ${observed}. London: Example Press, 2000.`;
        const bibliography = c.normalizeBibliographyCitation(supplied);
        assert.equal(bibliography, `Smith, Alex. A Commentary. Example Series, vol. ${number}. London: Example Press, 2000.`);
        const { footnote, short } = c.buildCitationVariantsFromBibliography(bibliography);
        assert.equal(footnote, `Alex Smith, A Commentary, Example Series, vol. ${number} (London: Example Press, 2000).`);
        assert.equal(short, `Smith, Alex. A Commentary, vol. ${number}`);
        assert.equal(c.normalizeBibliographyCitation(bibliography), bibliography, 'repeat formatting must be stable');
        assert.equal(c.formatCitationHtml(bibliography), `Smith, Alex. <em>A Commentary</em>. Example Series, vol. ${number}. London: Example Press, 2000.`);
        assert.equal(c.normalizeFormalVolumeDetail(`Volume ${observed}`), `Vol. ${number}`);
        assert.equal(c.extractTrailingVolumeMarker(`A Commentary, Volume ${observed}`).marker, `vol. ${number}`);
        assert.equal(c.extractTitleEmbeddedVolumeDetail(`Collected Works: Volume ${observed}, Letters`).marker, `vol. ${number}`);
        assert.equal(c.extractLeadingVolumeTitleDetail(`Volume ${observed}, Letters`).marker, `vol. ${number}`);
    }
});

test('reported lettered volumes stay outside footnote imprint and retain contributor initials', () => {
    const { context: c } = formatter();
    // Supplied citation strings, not a new AI read or bibliographic fact check.
    const entries = [
        ['Propp, William H. C.', 'William H. C. Propp', 'Exodus 19–40: A New Translation with Introduction and Commentary', 'The Anchor Bible', '2A', 'New York: Doubleday, 2006'],
        ['Sasson, Jack M.', 'Jack M. Sasson', 'Judges 13–21: A New Translation with Commentary', 'The Anchor Yale Bible', '6E', 'New Haven: Yale University Press, 2025']
    ];
    for (const [author, noteAuthor, title, series, volume, imprint] of entries) {
        const bibliography = c.normalizeBibliographyCitation(`${author} ${title}. ${series}, volume ${volume}. ${imprint}.`);
        assert.equal(bibliography, `${author} ${title}. ${series}, vol. ${volume}. ${imprint}.`);
        assert.equal(c.buildCitationVariantsFromBibliography(bibliography).footnote, `${noteAuthor}, ${title}, ${series}, vol. ${volume} (${imprint}).`);
    }
});

test('missing volumes stay absent even when a source filename supplies one', () => {
    const { context: c, fields } = formatter();
    const bibliography = 'Moore, Carey A. Esther. The Anchor Bible.';
    fields.dropboxUrl.value = 'https://example.test/Esther-Volume-7A.pdf';
    c.fillDerivedCitationFields(bibliography);
    assert.equal(fields.shortCitation.value, 'Moore, Carey A. Esther');
    assert.equal(fields.footnoteCitation.value, 'Carey A. Moore, Esther, The Anchor Bible.');
    assert.equal(c.normalizeVolumeMarker('Volume and Voice'), '');
    assert.equal(c.formatFormalCitationTitle('Volume and Voice'), 'Volume and Voice');
    assert.equal(c.normalizeFormalVolumeDetail('Volume 2A3'), 'Volume 2A3', 'never truncate an unrecognized designation');
});

test('edition abbreviations retain qualifiers and punctuation in bibliography and note', () => {
    const { context: c } = formatter();
    for (const [observed, bibEdition, noteEdition] of [
        ['second edition', '2nd ed.', '2nd ed.'],
        ['20th anniversary edition', '20th anniversary ed.', '20th anniversary ed.'],
        ['revised edition', 'Rev. ed.', 'rev. ed.'],
        ['Expanded edition', 'Expanded ed.', 'expanded ed.'],
        ['Updated edition', 'Updated ed.', 'updated ed.']
    ]) {
        const bibliography = c.normalizeBibliographyCitation(`Smith, Alex. A Book. ${observed}. London: Example Press, 2000.`);
        assert.equal(bibliography, `Smith, Alex. A Book. ${bibEdition} London: Example Press, 2000.`);
        assert.equal(c.normalizeBibliographyCitation(bibliography), bibliography);
        assert.equal(c.buildCitationVariantsFromBibliography(bibliography).footnote, `Alex Smith, A Book, ${noteEdition} (London: Example Press, 2000).`);
    }
});
