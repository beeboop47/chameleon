const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

// A small DOM fixture for state and privacy checks; visual checks use the live site.
function fixture() {
    const nodes = new Map();
    class Element {
        constructor() {
            this.style = {}; this.dataset = {}; this.children = []; this.handlers = {};
            this.value = ''; this.checked = false; this.disabled = false; this.attributes = {};
            this.classList = { add() {}, remove() {} };
        }
        set innerHTML(html) {
            this.html = html; this.children = [];
            for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], new Element());
        }
        get innerHTML() { return this.html || ''; }
        set textContent(value) { this.text = value; this.html = ''; this.children = []; }
        get textContent() { return this.text || ''; }
        addEventListener(event, handler) { this.handlers[event] = handler; }
        appendChild(node) { this.children.push(node); }
        prepend(node) { this.children.unshift(node); }
        setAttribute(name, value) { this.attributes[name] = value; }
        querySelectorAll() { return this.children; }
        focus() {}
        async click() { if (!this.disabled) return this.handlers.click?.(); }
    }
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const match of html.matchAll(/id="([^"]+)"/g)) nodes.set(match[1], new Element());
    const get = id => { assert(nodes.has(id), `Missing element ${id}`); return nodes.get(id); };
    get('gameMode').value = 'word'; get('mode').value = 'random'; get('impostorCount').value = '1';
    const alerts = [];
    const context = vm.createContext({
        document: { getElementById: get, createElement: () => new Element() },
        window: {}, alert: message => alerts.push(message), confirm: () => false,
        AbortSignal, fetch: () => { throw new Error('Live API calls are disabled in tests.'); }
    });
    for (const file of ['visuals.js', 'game.js', 'generator.js', 'game-flow.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    const run = code => vm.runInContext(code, context);
    const click = id => get(id).click();
    function wordSetup() {
        get('gameMode').value = 'wordImpostor'; get('mode').value = 'manual';
        get('phrase').value = 'Pancake'; get('impostorPhrase').value = 'Waffle';
        run(`players = [{name:'A',selectedRole:'normal'},{name:'B',selectedRole:'impostor'},{name:'C',selectedRole:'seer',seerMode:'player',seerRevealPlayerIndex:1},{name:'D',selectedRole:'normal'}]; updateModeUI();`);
    }
    async function reveal(index) { run(`current = ${index}; updatePlay();`); await click('handoffReady'); await click('reveal'); return get('word').innerHTML; }
    return { context, get, run, click, alerts, wordSetup, reveal };
}

test('Word Impostor assigns hidden decoy, identical cards, and private handoffs', async () => {
    const f = fixture(); f.wordSetup(); await f.click('startBtn');
    assert.equal(f.run('roles[1]'), 'wordImpostor');
    assert(f.run("roleIsTreatedAsImpostor('wordImpostor')"));
    assert(!f.get('word').innerHTML.includes('Pancake'));
    const innocent = await f.reveal(0);
    const impostor = await f.reveal(1);
    assert(innocent.includes('Pancake')); assert(!innocent.includes('Waffle'));
    assert(impostor.includes('Waffle')); assert(!impostor.includes('Pancake'));
    assert(!impostor.includes('IMPOSTOR')); assert(!innocent.includes('INNOCENT'));
    assert.equal(innocent.replace('Pancake', 'WORD'), impostor.replace('Waffle', 'WORD'));
    await f.click('next'); assert(!f.get('word').innerHTML.includes('Waffle'));
});

test('Seer detects Word Impostor in player and role modes', async () => {
    const f = fixture(); f.wordSetup(); await f.click('startBtn');
    const playerClue = await f.reveal(2);
    assert(playerClue.includes('B — (special role or impostor)'));
    f.run("players[2].seerMode = 'role'");
    assert((await f.reveal(2)).includes('At least one impostor is present'));
});

test('Random slots become Word Impostors and never take every player', async () => {
    const f = fixture(); f.wordSetup(); f.get('mode').value = 'random'; await f.click('startBtn');
    assert.equal(f.run("roles.filter(r => r === 'wordImpostor').length"), 1);
    assert(!f.run("roles.includes('impostor')"));
    f.get('impostorCount').value = '4';
    assert.equal(f.run('validateRoundSetup()'), false);
});

test('Setup rejects missing or identical words without starting', async () => {
    const f = fixture(); f.wordSetup(); f.get('impostorPhrase').value = '';
    await f.click('startBtn'); assert.equal(f.run('roundWords'), null);
    f.get('impostorPhrase').value = ' pancake! ';
    await f.click('startBtn'); assert.equal(f.run('roundWords'), null);
    assert.equal(f.alerts.length, 2);
});

test('Votes exclude self; catching Word Impostor wins; final summary shows both words', async () => {
    const f = fixture(); f.wordSetup(); await f.click('startBtn');
    f.run('allViewed = true; startVoting()');
    for (let i = 0; i < 4; i++) {
        await f.click('openBallot');
        const choices = f.get('voteOptions').children;
        assert(!choices.some(button => button.textContent === ['A', 'B', 'C', 'D'][i]));
        const target = choices.find(button => button.textContent === (i === 1 ? 'A' : 'B'));
        await target.click(); const confirm = f.get('confirmVote'); await confirm.click(); await confirm.click();
        assert.equal(f.run('ballots.length'), i + 1);
    }
    assert(f.get('word').innerHTML.includes('Innocents win!'));
    assert(!f.get('summaryContainer').innerHTML.includes('Waffle'));
    await f.click('revealResults');
    const summary = f.get('summaryContainer').innerHTML;
    assert(summary.includes('Pancake')); assert(summary.includes('Waffle')); assert(summary.includes('Word Impostor'));
});

test('Other game modes still reveal original roles and question answers', async () => {
    for (const mode of ['word', 'bluff', 'question']) {
        const f = fixture(); f.wordSetup(); f.get('gameMode').value = mode;
        f.get('questionNonImpostor').value = 'Favourite place?'; f.get('questionImpostor').value = 'Overrated place?';
        await f.click('startBtn'); assert.equal(f.run('roles[1]'), 'impostor');
        const reveal = await f.reveal(1);
        assert(mode === 'question' ? reveal.includes('Overrated place?') : reveal.includes('IMPOSTOR'));
        if (mode === 'question') {
            for (let i = 0; i < 4; i++) {
                await f.reveal(i); f.get('answerInput').value = 'Paris'; await f.click('submitAnswer');
            }
            assert(f.run('allViewed')); assert(f.get('summaryContainer').innerHTML.includes('Paris'));
        }
    }
});

const validPair = { phrase: 'Socialism', impostorPhrase: 'Communism', hostRequirementsMet: true, playable: true };
function mockAI(f, values) {
    const requests = [];
    f.get('openaiKey').value = 'test-only-placeholder';
    f.context.fetch = async (url, options) => {
        requests.push(JSON.parse(options.body));
        const value = values[Math.min(requests.length - 1, values.length - 1)];
        return { ok: true, json: async () => ({ choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) }, finish_reason: 'stop' }] }) };
    };
    return requests;
}

test('Generator preserves host instructions, requests JSON, and inserts valid pair', async () => {
    const f = fixture(); f.wordSetup(); f.get('genPrompt').value = 'Only political ideologies on the political compass.';
    const requests = mockAI(f, [validPair]); await f.run('generateForCurrentMode()');
    assert.equal(requests[0].messages[1].content, f.get('genPrompt').value);
    assert.equal(requests[0].response_format.type, 'json_object');
    assert(!requests[0].messages[0].content.includes('Avoid politics'));
    assert.equal(f.get('phrase').value, 'Socialism'); assert.equal(f.get('impostorPhrase').value, 'Communism');
    assert(!f.get('startBtn').disabled); assert(!f.get('gameMode').disabled);
});

test('Invalid model outputs retry; failed attempts leave the form unchanged', async () => {
    const f = fixture(); f.wordSetup();
    const requests = mockAI(f, ['Dog', { ...validPair, impostorPhrase: 'Socialism!' }, validPair]);
    await f.run('generateForCurrentMode()'); assert.equal(requests.length, 3);
    mockAI(f, [{ ...validPair, hostRequirementsMet: false }]);
    await assert.rejects(f.run('generateForCurrentMode()'));
    assert.equal(f.get('phrase').value, 'Socialism'); assert.equal(f.get('impostorPhrase').value, 'Communism');
    assert(!f.get('generateBtn').disabled);
});

test('Mode-specific generation preserves full hints and distinct question pairs', async () => {
    const f = fixture();
    for (const [mode, content, field, expected] of [
        ['word', { phrase: 'Maoism' }, 'phrase', 'Maoism'],
        ['bluff', { phrase: 'Moon', hint: 'One small step for a very long journey' }, 'bluffHint', 'One small step for a very long journey'],
        ['question', { innocentQuestion: 'Where would you live?', impostorQuestion: 'Where would you visit?' }, 'questionImpostor', 'Where would you visit?']
    ]) {
        f.get('gameMode').value = mode; mockAI(f, [{ ...content, hostRequirementsMet: true, playable: true }]);
        await f.run('generateForCurrentMode()'); assert.equal(f.get(field).value, expected);
    }
});

test('Generation failure stops start; key failures are not retried or exposed', async () => {
    const f = fixture(); f.wordSetup(); f.get('useOpenAI').checked = true; f.get('generateOnStart').checked = true;
    const requests = mockAI(f, ['invalid']); await f.click('startBtn');
    assert.equal(f.run('roundWords'), null); assert.equal(requests.length, 3);
    let calls = 0;
    f.context.fetch = async () => { calls++; return { ok: false, status: 401 }; };
    await assert.rejects(f.run('generateForCurrentMode()'), /key was not accepted/);
    assert.equal(calls, 1); assert(!f.get('generationStatus').textContent.includes('test-only-placeholder'));
});
