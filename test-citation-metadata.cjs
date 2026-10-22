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
    function element() {
        return {
            value: '', innerHTML: '', style: {}, dataset: {}, children: [],
            classList: { add() {}, remove() {}, toggle() {} },
            addEventListener(type, fn) { this[type] = fn; },
            appendChild(child) { this.children.push(child); },
            querySelector() { return this.pre ||= element(); },
            focus() {},
            setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
            get textContent() { return this.innerHTML.replace(/<[^>]*>/g, ''); },
            set textContent(text) { this.innerHTML = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
        };
    }
    const document = {
        addEventListener() {},
        getElementById(id) {
            return fields[id] ||= element();
        },
        createElement: element,
        querySelectorAll() { return []; }
    };
    const context = vm.createContext({ document, pdfjsLib: { GlobalWorkerOptions: {} }, setTimeout() {}, clearTimeout() {} });
    vm.runInContext(source, context);
    return { context, fields };
}

const reportedBibliography = 'Ward, W. Reginald, and Richard P. Heitzenrater, eds. Journal and Diaries II (1738–43). The Bicentennial Edition of the Works of John Wesley, vol. 19. Nashville: Abingdon Press, 1990.';

function titleSpan(citation, title) {
    const start = citation.indexOf(title);
    return { citation, start, end: start + title.length };
}

function selectTitle(c, fields, title, start = fields.citation.value.indexOf(title)) {
    fields.citation.setSelectionRange(start, start + title.length);
    c.useSelectedCitationTitle();
}

test('complete editor names, dated title, and series volume survive all citation formats', () => {
    const { context: c } = formatter();
    assert.equal(c.normalizeBibliographyCitation(reportedBibliography), reportedBibliography);
    const parts = c.parseBibliographyCitation(reportedBibliography);
    assert.equal(parts.authorText, 'Ward, W. Reginald, and Richard P. Heitzenrater, eds');
    assert.equal(parts.titleText, 'Journal and Diaries II (1738–43)');
    const variants = c.buildCitationVariantsFromBibliography(reportedBibliography);
    assert.equal(variants.footnote, 'W. Reginald Ward and Richard P. Heitzenrater, eds., Journal and Diaries II (1738–43), The Bicentennial Edition of the Works of John Wesley, vol. 19 (Nashville: Abingdon Press, 1990).');
    assert.equal(variants.short, 'Ward, W. Reginald, and Richard P. Heitzenrater, eds. Journal and Diaries II (1738–43), vol. 19');
    assert.match(c.formatCitationHtml(reportedBibliography, titleSpan(reportedBibliography, 'Journal and Diaries II (1738–43)')), /<em>Journal and Diaries II \(1738–43\)<\/em>/);
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
        assert.equal(c.formatCitationHtml(bibliography, titleSpan(bibliography, 'A Commentary')), `Smith, Alex. <em>A Commentary</em>. Example Series, vol. ${number}. London: Example Press, 2000.`);
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

test('complete compound surnames and historical names survive bibliography, note and HTML', () => {
    const { context: c } = formatter();
    for (const [creator, noteName] of [
        ['García Márquez, Gabriel', 'Gabriel García Márquez'],
        ['García Márquez, G.', 'G. García Márquez'],
        ['Pérez García, María José', 'María José Pérez García'],
        ['García y Vega, Ana', 'Ana García y Vega'],
        ['de la Cruz, Juan', 'Juan de la Cruz'],
        ['Clement of Alexandria', 'Clement of Alexandria'],
        ['St. Augustine of Hippo', 'St. Augustine of Hippo'],
        ['Augustine', 'Augustine'],
        ['Gabriel García Márquez', 'Gabriel García Márquez'],
        ['Clement of Alexandria and Basil of Caesarea', 'Clement of Alexandria and Basil of Caesarea'],
        ['García Márquez, Gabriel, and María Pérez García', 'Gabriel García Márquez and María Pérez García'],
        ['Smith, John, Jr.', 'John Smith Jr.'],
    ]) {
        const citation = `${creator.replace(/\.$/, '')}. Collected Writings. London: Example Press, 2000.`;
        assert.equal(c.normalizeAutoFilledCitation(citation), citation);
        const variants = c.buildCitationVariantsFromBibliography(citation);
        assert.ok(variants.footnote.startsWith(noteName + ', Collected Writings'), variants.footnote);
        assert.equal(variants.short, `${creator.replace(/\.$/, '')}. Collected Writings`);
        assert.equal(c.formatCitationHtml(citation).replace(/<\/?em>/g, ''), citation);
    }
});

test('ambiguous multi-author name headings remain intact rather than merging two people', () => {
    const { context: c } = formatter();
    for (const creators of [
        'Clement of Alexandria, Basil of Caesarea, and Augustine',
        'St. Augustine of Hippo, Clement of Alexandria, and Basil of Caesarea',
        'John Smith, Mary Jones, and Jane Doe',
        'John Smith, Mary Jones and Jane Doe',
        'Pérez García, María José, and Ana López',
        'Pérez García, María José, and Ana López, eds.',
    ]) {
        const citation = `${creators.replace(/\.$/, '')}. Collected Writings. London: Example Press, 2000.`;
        assert.equal(c.normalizeAutoFilledCitation(citation), citation);
        assert.equal(c.buildCitationVariantsFromBibliography(citation).footnote,
            `${creators}, Collected Writings (London: Example Press, 2000).`);
        assert.equal(c.formatCitationHtml(citation).replace(/<\/?em>/g, ''), citation);
    }
});

test('manual correction updates every HTML part and preview without new reads or links', async () => {
    const { context: c, fields } = formatter();
    c.fetch = c.requestHeadingSuggestion = c.pdfjsLib.getDocument = () => assert.fail('no network or PDF read');
    fields.dropboxUrl.value = 'https://www.dropbox.com/example-book';
    fields.citation.value = reportedBibliography;
    const chapters = Array.from({ length: 65 }, (_, i) => ({ title: `Chapter ${i + 1}`, start: i + 1, end: i + 2 }));
    const tokens = chapters.map((_, i) => ({ token: `synthetic-token-${i}` }));
    c.generateOutput(reportedBibliography, chapters, tokens, 100);
    const beforeLinks = vm.runInContext('generatedParts.map(p => p.html.match(/data-dtl-url="[^"]+"/g)).flat().join("|")', c);
    c.fillDerivedCitationFields(reportedBibliography);
    fields.footnoteCitation.value = 'My manually corrected footnote';
    fields.shortCitation.value = 'My manually corrected short line';
    const corrected = 'García Márquez, Gabriel. My manually corrected title. Vol. 2A. Madrid: Example, 2000.';
    fields.citation.value = corrected;
    fields.citation.input.call(fields.citation);
    assert.equal(fields.updateHtmlButton.disabled, false);
    fields.citation.change.call(fields.citation);
    assert.equal(fields.citation.value, corrected);
    selectTitle(c, fields, 'My manually corrected title');
    assert.equal(c.updateGeneratedHtml(), true);
    const parts = vm.runInContext('generatedParts', c);
    assert.equal(parts.length, 3);
    for (const part of parts) {
        assert.ok(part.html.includes('García Márquez, Gabriel. <em>My manually corrected title</em>. Vol. 2A.'));
        assert.doesNotMatch(part.html, /Ward, W\. Reginald/);
    }
    const afterLinks = vm.runInContext('generatedParts.map(p => p.html.match(/data-dtl-url="[^"]+"/g)).flat().join("|")', c);
    assert.equal(afterLinks, beforeLinks);
    assert.equal(fields.previewBox.innerHTML, parts.map(p => p.html).join('\n'));
    assert.equal(fields.footnoteCitation.value, 'My manually corrected footnote');
    assert.equal(fields.shortCitation.value, 'My manually corrected short line');
    assert.equal(fields.updateHtmlButton.disabled, true);
    assert.match(fields.htmlUpdateNote.textContent, /Copy the updated part/);
    assert.equal(await c.fillCitationFromPdfIfNeeded({}, 'synthetic-password', fields.dropboxUrl.value), corrected);
    // Copy is safe even if the user overlooks Update HTML.
    let copied;
    c.navigator = { clipboard: { writeText: async text => { copied = text; } } };
    fields.citation.value = 'Clement of Alexandria. Writings. London: Example, 2000.';
    selectTitle(c, fields, 'Writings');
    c.copyPart(0);
    await Promise.resolve();
    assert.ok(copied.includes('Clement of Alexandria. <em>Writings</em>.'));
    assert.doesNotMatch(copied, /García Márquez/);
});

test('empty citations, changed source and new book cannot reuse a stale HTML context', () => {
    const { context: c, fields } = formatter();
    assert.equal(c.updateGeneratedHtml(), false);
    fields.dropboxUrl.value = 'https://www.dropbox.com/first-book';
    fields.citation.value = reportedBibliography;
    c.generateOutput(reportedBibliography, [{ title: 'Chapter', start: 1, end: 5 }], [{ token: 'synthetic-token' }], 5);
    fields.citation.value = '';
    fields.citation.input();
    assert.equal(fields.updateHtmlButton.disabled, true);
    assert.equal(c.updateGeneratedHtml(), false);
    fields.citation.value = 'Corrected citation';
    fields.dropboxUrl.value = 'https://www.dropbox.com/different-book';
    fields.dropboxUrl.input();
    assert.equal(fields.updateHtmlButton.disabled, true);
    assert.equal(c.updateGeneratedHtml(), false);
    assert.match(fields.htmlUpdateNote.textContent, /Dropbox link changed/);
    c.startNextBook();
    assert.equal(vm.runInContext('generatedBook', c), null);
    assert.equal(fields.previewBox.innerHTML, '');
    assert.equal(fields.updateHtmlButton.disabled, true);
});

test('HTML styling never rewrites staff text or interprets it as markup', () => {
    const { context: c } = formatter();
    for (const citation of [
        'Augustine. A title with unusual casing! London: Example, 2000',
        'Pérez García, María José. Title. Series, volume 4A. My deliberately edited punctuation',
        '<img src=x onerror=alert(1)> & "Manual citation"',
    ]) {
        assert.equal(c.formatCitationHtml(citation).replace(/<\/?em>/g, ''), c.escapeHtml(citation));
    }
});

test('a manual correction made during scanning wins over the eventual response', async () => {
    const { context: c, fields } = formatter();
    c.showStatus = c.showCitationNote = () => {};
    c.getCitationPageNumbers = () => [1];
    c.extractFrontMatterLines = c.renderFrontMatterImages = async () => [];
    c.requestHeadingSuggestion = async () => {
        fields.citation.value = 'Clement of Alexandria. Collected Writings.';
        return { source: 'ai', heading: reportedBibliography };
    };
    assert.equal(await c.fillCitationFromPdfIfNeeded({}, 'synthetic-password', 'book'), fields.citation.value);
    assert.equal(fields.citation.value, 'Clement of Alexandria. Collected Writings.');
});

test('successful scanner warnings reach the citation note as text without another request', async () => {
    const { context: c, fields } = formatter();
    let requests = 0;
    c.showStatus = () => {};
    c.getCitationPageNumbers = () => [1];
    c.extractFrontMatterLines = c.renderFrontMatterImages = async () => [];
    c.requestHeadingSuggestion = async () => {
        requests++;
        return { source: 'ai', heading: reportedBibliography, note: 'Review name order: <uncertain>' };
    };
    await c.fillCitationFromPdfIfNeeded({}, 'synthetic-password', 'book');
    assert.equal(requests, 1);
    assert.match(fields.citationSuggestionNote.innerHTML, /Review name order: &lt;uncertain&gt;/);
    assert.doesNotMatch(fields.citationSuggestionNote.innerHTML, /<uncertain>/);
    // New book resets Copy buttons, but must not rename Update HTML to Copy.
    assert.match(html, /id="updateHtmlButton" class="btn-update-html"/);
});

test('scanned title flows through the existing request into italics without parsing names', async () => {
    const { context: c, fields } = formatter();
    const title = 'God Who Creates: Essays in Honor of W. Sibley Towner';
    const citation = `An ambiguous contributor. ${title}. London: Example, 2000.`;
    fields.dropboxUrl.value = 'book';
    c.showStatus = () => {};
    c.getCitationPageNumbers = () => [1];
    c.extractFrontMatterLines = c.renderFrontMatterImages = async () => [];
    let requests = 0;
    c.fetch = async () => {
        requests++;
        return { ok: true, json: async () => ({ source: 'ai', heading: citation, title }) };
    };
    await c.fillCitationFromPdfIfNeeded({}, 'synthetic-password', 'book');
    const actual = fields.citation.value;
    assert.equal(requests, 1);
    assert.match(c.formatCitationHtml(actual, c.getCitationTitleRange(actual)), /<em>God Who Creates: Essays in Honor of W\. Sibley Towner<\/em>/);
    assert.equal(c.formatCitationHtml(actual), c.escapeHtml(actual), 'no explicit title means no heuristic italics');
    for (const bad of ['', null, { title }, 'Missing Title', 'God who creates']) {
        c.setScannedCitationTitle(actual, bad, 'book');
        assert.equal(c.getCitationTitleRange(actual), null);
    }
});

test('manual selection resolves repeated text and formatting-only edits refresh all parts and copies', async () => {
    const { context: c, fields } = formatter();
    c.fetch = c.requestHeadingSuggestion = c.pdfjsLib.getDocument = () => assert.fail('no request needed');
    const citation = 'Augustine. Augustine. London: Example, 2000.';
    fields.citation.value = citation;
    fields.dropboxUrl.value = 'book';
    c.setScannedCitationTitle(citation, 'Augustine', 'book');
    assert.equal(c.getCitationTitleRange(citation), null, 'ambiguous repeated text stays plain');
    const chapters = Array.from({ length: 31 }, (_, i) => ({ title: `Chapter ${i + 1}`, start: i + 1, end: i + 2 }));
    c.generateOutput(citation, chapters, chapters.map((_, i) => ({ token: `synthetic-${i}` })), 40);
    const links = vm.runInContext('generatedParts.map(p => p.html.match(/data-dtl-url="[^"]+"/g)).flat().join("|")', c);
    selectTitle(c, fields, 'Augustine', citation.lastIndexOf('Augustine'));
    assert.equal(fields.updateHtmlButton.disabled, false);
    let copied;
    c.navigator = { clipboard: { writeText: async text => { copied = text; } } };
    await c.copyPart(0);
    assert.match(copied, /Augustine\. <em>Augustine<\/em>\./);
    for (const p of vm.runInContext('generatedParts', c)) assert.match(p.html, /Augustine\. <em>Augustine<\/em>\./);
    c.clearCitationTitle();
    assert.equal(fields.updateHtmlButton.disabled, false);
    c.updateGeneratedHtml();
    assert.doesNotMatch(fields.previewBox.innerHTML, /<em>/);
    assert.equal(vm.runInContext('generatedParts.map(p => p.html.match(/data-dtl-url="[^"]+"/g)).flat().join("|")', c), links);
    selectTitle(c, fields, 'Augustine', citation.lastIndexOf('Augustine'));
    c.startNextBook();
    assert.equal(c.getCitationTitleRange(citation, 'book'), null);
});

test('author and imprint edits preserve title; title or boundary edits invalidate rather than guess', () => {
    const { context: c, fields } = formatter();
    fields.dropboxUrl.value = 'book';
    fields.citation.value = 'Alexandria, Clement of. Writings. London: Example, 2000.';
    c.setScannedCitationTitle(fields.citation.value, 'Writings', 'book');
    for (const citation of ['Clement of Alexandria. Writings. London: Example, 2000.', 'Clement of Alexandria. Writings. Paris: Example, 2001.']) {
        fields.citation.value = citation;
        fields.citation.input();
        assert.match(c.formatCitationHtml(citation, c.getCitationTitleRange(citation)), /<em>Writings<\/em>/);
    }
    for (const title of ['New Writings', 'Writings: A Selection', 'Works']) {
        fields.citation.value = 'Clement of Alexandria. Writings. Paris: Example, 2001.';
        c.setScannedCitationTitle(fields.citation.value, 'Writings', 'book');
        fields.citation.value = `Clement of Alexandria. ${title}. Paris: Example, 2001.`;
        fields.citation.input();
        assert.equal(c.getCitationTitleRange(fields.citation.value), null, title);
    }
    selectTitle(c, fields, 'Works');
    fields.dropboxUrl.value = 'different-book';
    assert.equal(c.getCitationTitleRange(fields.citation.value), null);
});

test('manual selection trims edge whitespace and escapes all selected content', () => {
    const { context: c, fields } = formatter();
    fields.citation.value = '  Author. 한국어 [English] & <script>title</script>.  ';
    selectTitle(c, fields, ' 한국어 [English] & <script>title</script>');
    const citation = fields.citation.value.trim();
    assert.equal(c.formatCitationHtml(citation, c.getCitationTitleRange(citation)), 'Author. <em>한국어 [English] &amp; &lt;script&gt;title&lt;/script&gt;</em>.');
    fields.citation.setSelectionRange(0, 0);
    c.useSelectedCitationTitle();
    assert.match(fields.citationTitleNote.textContent, /Highlight the title/);
    assert.ok(c.getCitationTitleRange(citation), 'empty selection does not erase valid title');
});

test('clearing italics while the scanner is in flight remains a manual choice', async () => {
    const { context: c, fields } = formatter();
    fields.dropboxUrl.value = 'book';
    c.showStatus = c.showCitationNote = () => {};
    c.getCitationPageNumbers = () => [1];
    c.extractFrontMatterLines = c.renderFrontMatterImages = async () => [];
    c.requestHeadingSuggestion = async () => {
        c.clearCitationTitle();
        return { source: 'ai', heading: 'Clement of Alexandria. Writings.', title: 'Writings' };
    };
    await c.fillCitationFromPdfIfNeeded({}, 'synthetic-password', 'book');
    assert.equal(c.getCitationTitleRange(fields.citation.value), null);
});
