// State and rendered-markup checks. This harness does not measure browser layout.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const analysis = require('../dist/analysis.js');
const app = fs.readFileSync(require.resolve('../dist/app.js'), 'utf8');

function workspace(search = '') {
  const elements = new Map(), listeners = {};
  const document = { activeElement: null };
  function element(selector) {
    if (elements.has(selector)) return elements.get(selector);
    const classes = new Set(), events = {};
    const node = {
      innerHTML: '', textContent: '', hidden: false, disabled: false, open: false, dataset: {}, isConnected: true,
      classList: { add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)), contains: name => classes.has(name), toggle(name, force) { const yes = force === undefined ? !classes.has(name) : force; yes ? classes.add(name) : classes.delete(name); } },
      setAttribute(name, value) { this[name] = String(value); },
      addEventListener(name, fn) { events[name] = fn; },
      focus() { document.activeElement = this; }, scrollIntoView() {},
      showModal() { this.open = true; }, close() { this.open = false; },
      events,
    };
    elements.set(selector, node);
    return node;
  }
  Object.assign(document, {
    querySelector: element,
    querySelectorAll(selector) {
      if (selector === '.mode-button') return ['training', 'playground'].map(mode => { const node = element(`mode-${mode}`); node.dataset.mode = mode; return node; });
      return [];
    },
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
  });
  const context = vm.createContext({ document, window: { location: { search }, matchMedia: () => ({ matches: false }) }, SnapAnalysis: analysis, URLSearchParams, setTimeout: () => 0, clearTimeout() {} });
  vm.runInContext(app, context);
  function run(code) { return vm.runInContext(code, context); }
  function select(choice) {
    const node = { dataset: { reviewChoice: choice } };
    const target = { closest(selector) { return selector === '[data-review-choice]' ? node : null; } };
    listeners.click[0]({ target });
  }
  return { run, element, select };
}

function assertSlots(html) {
  const grids = [...html.matchAll(/<div class="card-grid"[^>]*>([\s\S]*?)<\/div>/g)];
  assert.equal(grids.length, 6);
  grids.forEach(grid => assert.equal((grid[1].match(/class="(?:mini-card |empty-slot")/g) || []).length, 4));
}

test('the ordinary default keeps recommendations hidden and unsupported positions ungraded', () => {
  const ui = workspace();
  assert.equal(ui.run('state.deck'), 'midrange');
  assert.equal(ui.run('state.opponent'), 'unknown');
  assert.equal(ui.element('#result-heading').hidden, true);
  assert.equal(ui.element('#comparison-panel').hidden, true);
  assert.equal(ui.element('#comparison-panel').innerHTML, '');
  ui.run('submitTurn()');
  assert.equal(ui.run('state.analysis.available'), false);
  assert.match(ui.element('#result-heading').innerHTML, /Analysis unavailable/);
  assert.doesNotMatch(ui.element('#result-heading').innerHTML, /0\.40|0\.00/);
  assert.match(ui.element('#comparison-panel').innerHTML, /Open solved drill/);
  ui.select('0');
  assert.equal(ui.run('state.preview'), null);
  assertSlots(ui.element('#game-table').innerHTML);
});

test('all four complete-turn selections preserve submitted EV and unresolved leadership', () => {
  const ui = workspace('?review=example');
  assert.equal(ui.run('state.analysis.available'), true);
  assert.match(ui.element('#result-heading').innerHTML, /EV loss: <strong>0\.40/);
  const originalPlan = ui.run('JSON.stringify(state.plan)');
  const originalHeading = ui.element('#result-heading').innerHTML;
  const originalBoard = ui.element('#game-table').innerHTML;
  const leaders = html => [...html.matchAll(/data-revealed-leader="([^"]+)"/g)].map(m => m[1]);
  for (const [choice, projected] of [['0', 7], ['1', 11], ['2', 11], ['yours', 15]]) {
    ui.select(choice);
    const board = ui.element('#game-table').innerHTML;
    assertSlots(board);
    assert.match(board, new RegExp(`projected ${projected}; opponent commitment unresolved`));
    assert.deepEqual(leaders(board), leaders(originalBoard));
    assert.match(board, /<dt>Your EV<\/dt><dd>−0\.20/);
    assert.match(board, /<dt>Maximum EV<\/dt><dd>\+0\.20/);
    assert.equal(ui.element('#result-heading').innerHTML, originalHeading);
    assert.equal(ui.run('JSON.stringify(state.plan)'), originalPlan);
    assert.match(ui.element('#comparison-panel').innerHTML, new RegExp(`data-review-choice="${choice}" aria-pressed="true"`));
  }
  assert.equal(ui.element('#game-table').innerHTML, originalBoard);
});

test('retry, undo, passing, split cards, and a new optimal commitment use fresh state', () => {
  const ui = workspace('?drill=public-hands');
  assert.equal(ui.element('#known-opponent-hand').hidden, false);
  assert.match(ui.element('#known-opponent-hand').innerHTML, /known hand: 1, 2, 4, 6/);
  assert.equal(ui.element('#result-heading').hidden, true);
  const initialBoard = ui.element('#game-table').innerHTML;
  ui.run('placeCard(state.scenario.hand.find(c=>c.cost===6).id,2)');
  ui.run('actions.undo()');
  assert.equal(ui.element('#game-table').innerHTML, initialBoard);
  ui.run('submitTurn()');
  assert.equal(ui.run('state.analysis.available'), true);
  assert.equal(ui.run('state.analysis.yours.plan.length'), 0);
  ui.run('actions.retry()');
  assert.equal(ui.run('state.analysis'), null);
  assert.equal(ui.element('#result-heading').hidden, true);
  assert.equal(ui.element('#game-table').innerHTML, initialBoard);
  ui.run('placeCard(state.scenario.hand.find(c=>c.cost===4).id,0);placeCard(state.scenario.hand.find(c=>c.cost===2).id,0);submitTurn()');
  assert.match(ui.element('#comparison-panel').innerHTML, /<span class="turn-cell turn-cell-0">4\+2<\/span>/);
  assertSlots(ui.element('#game-table').innerHTML);
  assert.equal(ui.run('state.analysis.yours.lossNumerator'), 0);
  assert.match(ui.element('#result-heading').innerHTML, /quality-good/);
  ui.run('actions.retry();placeCard(state.scenario.hand.find(c=>c.cost===6).id,0);submitTurn()');
  assert.match(ui.element('#result-heading').innerHTML, /EV loss: <strong>0\.00/);
  assert.match(ui.element('#game-table').innerHTML, /<dt>Your EV<\/dt><dd>\+0\.20/);
  ui.run('nextPosition()');
  assert.equal(ui.run('state.scenario.rotation'), 1);
  assert.equal(ui.run('state.reviewed'), false);
  assert.equal(ui.element('#known-opponent-hand').hidden, false);
});

test('the solved drill uses board cards possible before turn six and compatible Balanced decks', () => {
  const ui = workspace('?drill=public-hands');
  const preset = JSON.parse(ui.run('JSON.stringify(PRESETS.balanced.cards)'));
  const fixture = analysis.createFixture();
  for (const side of ['player', 'opponent']) {
    const existing = fixture[side].flat().map(card => card.cost);
    assert.deepEqual(existing.sort((a, b) => a - b), [1, 2, 3, 4, 5]);
    const hand = side === 'player' ? fixture.hand.map(card => card.cost) : fixture.opponentHand;
    const remaining = [...preset];
    for (const value of [...existing, ...hand]) {
      const index = remaining.indexOf(value);
      assert.notEqual(index, -1);
      remaining.splice(index, 1);
    }
  }
});
