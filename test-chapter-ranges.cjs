const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise only the shipped functions, never the page, Worker, or PDF parser.
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const context = vm.createContext({ console: { warn() {} } });
for (const name of ['getPageNumber', 'extractChapters']) {
    const match = html.match(new RegExp('        async function ' + name + '\\([^]*?\\n        \\}'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
}
const bookmark = (title, page, items = []) => ({ title, dest: page == null ? null : [{ page }], items });
async function ranges(outline) {
    let resolutions = 0;
    const pdf = { getPageIndex: async ref => { resolutions++; return ref.page - 1; } };
    const result = await context.extractChapters(pdf, outline, 100);
    return { rows: JSON.parse(JSON.stringify(result)), resolutions };
}

const cases = [
    ['ordinary boundaries overlap', [bookmark('A', 10), bookmark('B', 20)],
        [{ title: 'A', start: 10, end: 20 }, { title: 'B', start: 20, end: 100 }], 2],
    ['parents span all nested children', [bookmark('Parent', 10, [bookmark('First', 12), bookmark('Second', 20)]), bookmark('Next', 40)],
        [{ title: 'Parent', start: 10, end: 40 }, { title: 'First', start: 12, end: 20 },
         { title: 'Second', start: 20, end: 40 }, { title: 'Next', start: 40, end: 100 }], 4],
    ['invalid successor does not extend to document end', [bookmark('A', 10), bookmark('Missing', null), bookmark('Later', 30)],
        [{ title: 'A', start: 10, end: 30 }, { title: 'Later', start: 30, end: 100 }], 2],
    ['valid children survive an invalid parent', [bookmark('A', 10), bookmark('Missing', null, [bookmark('Child', 25)]), bookmark('Next', 40)],
        [{ title: 'A', start: 10, end: 25 }, { title: 'Child', start: 25, end: 40 },
         { title: 'Next', start: 40, end: 100 }], 3],
    ['same-page entries retain that shared page', [bookmark('A', 10), bookmark('B', 10)],
        [{ title: 'A', start: 10, end: 10 }, { title: 'B', start: 10, end: 100 }], 2],
    ['invalid starts are skipped and backward ends clamped, without title filters',
        [null, bookmark('Zero', 0), bookmark('Outside', 101), bookmark('Generated bookmarks', 20), bookmark('Earlier', 10)],
        [{ title: 'Generated bookmarks', start: 20, end: 20 }, { title: 'Earlier', start: 10, end: 100 }], 4],
];
for (const [name, outline, expected, resolutions] of cases) {
    test(name, async () => {
        const result = await ranges(outline);
        assert.deepEqual(result.rows, expected);
        assert.equal(result.resolutions, resolutions); // Each destination resolved once.
    });
}

test('named and indirect destinations survive neighboring reference failures', async () => {
    const pdf = {
        getDestination: async name => {
            if (name !== 'named') throw Error('Missing named destination');
            return [{ num: 11, gen: 0 }];
        },
        getPageIndex: async ref => {
            if (!ref || !Number.isInteger(ref.num)) throw Error('Malformed reference');
            return ({ 11: 9, 22: 19, 33: 29 })[ref.num];
        }
    };
    const outline = [{ title: 'Named', dest: 'named' }, { title: 'Malformed', dest: [{}] },
        { title: 'Indirect', dest: [{ num: 22, gen: 0 }] }, { title: 'Missing', dest: 'absent' },
        { title: 'Later', dest: [{ num: 33, gen: 0 }] }];
    const rows = JSON.parse(JSON.stringify(await context.extractChapters(pdf, outline, 100)));
    assert.deepEqual(rows, [{ title: 'Named', start: 10, end: 20 },
        { title: 'Indirect', start: 20, end: 30 }, { title: 'Later', start: 30, end: 100 }]);
});
