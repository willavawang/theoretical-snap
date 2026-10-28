const test = require('node:test');
const assert = require('node:assert/strict');
const analysis = require('../dist/analysis.js');

function plan(scenario, plays) {
  return plays.map(([cost, lane]) => ({ id: scenario.hand.find(card => card.cost === cost).id, lane }));
}

test('all 40 legal turns are certified against both sides of the exact equilibrium', () => {
  for (let rotation = 0; rotation < 3; rotation++) {
    const fixture = analysis.createFixture(rotation);
    const candidates = analysis.legalPlans(fixture, 6);
    assert.equal(candidates.length, 40);
    assert.equal(new Set(candidates.map(p => analysis.additions(p).join(','))).size, 37);
    for (const candidate of candidates) {
      const result = analysis.analyze(fixture, 6, candidate);
      assert.ok(result.available);
      assert.equal(result.maximumNumerator, 1);
      assert.ok(result.yours.lossNumerator >= 0);
      assert.equal(result.yours.wdl.reduce((a, b) => a + b), 5);
      assert.equal(result.yours.evNumerator, result.yours.wdl[0] - result.yours.wdl[2]);
      for (const alternate of result.alternates) {
        assert.notDeepEqual(alternate.plan, result.yours.plan);
        assert.ok(alternate.plan.reduce((sum, p) => sum + fixture.hand.find(c => c.id === p.id).cost, 0) <= 6);
      }
    }
  }
});

test('the handoff values are computed from joint match outcomes, including draws', () => {
  const fixture = analysis.createFixture();
  const result = analysis.analyze(fixture, 6, plan(fixture, [[6, 2]]));
  assert.deepEqual(result.yours.wdl, [2, 0, 3]);
  assert.equal(result.yours.evNumerator / result.denominator, -0.2);
  assert.equal(result.yours.lossNumerator / result.denominator, 0.4);
  assert.deepEqual(result.alternates.map(a => a.power), [[6, 0, 0], [0, 4, 2], [0, 6, 0]]);
  assert.deepEqual(result.alternates[1].wdl, [2, 2, 1]);
  assert.equal(result.alternates[1].evNumerator, result.alternates[0].evNumerator);
  assert.deepEqual(result.branch.power, [0, 6, 0]);
  assert.equal(result.branch.weight, 1);
  assert.equal(result.branch.yours, -1);
  assert.equal(result.branch.alternate, 1);
});

test('card composition stays distinct even when totals coincide; passing is legal', () => {
  const fixture = analysis.createFixture();
  const six = analysis.analyze(fixture, 6, plan(fixture, [[6, 0]]));
  const twoCards = analysis.analyze(fixture, 6, plan(fixture, [[4, 0], [2, 0]]));
  assert.equal(six.yours.plan.length, 1);
  assert.equal(twoCards.yours.plan.length, 2);
  assert.equal(six.yours.evNumerator, twoCards.yours.evNumerator);
  assert.ok(analysis.analyze(fixture, 6, []).available);
});

test('unsupported information sets, changed cards, and illegal turns are never graded', () => {
  const fixture = analysis.createFixture();
  assert.equal(analysis.analyze(fixture, 5, []).available, false);
  assert.equal(analysis.analyze({ ...fixture, analysisKey: null }, 6, []).available, false);
  assert.equal(analysis.analyze({ ...fixture, opponentHand: [] }, 6, []).available, false);
  assert.equal(analysis.analyze({ ...fixture, hand: fixture.hand.slice(1) }, 6, []).available, false);
  assert.equal(analysis.analyze(fixture, 6, plan(fixture, [[6, 0], [4, 1]])).available, false);
  const duplicate = plan(fixture, [[6, 0], [6, 1]]);
  assert.equal(analysis.analyze(fixture, 6, duplicate).available, false);
  const changed = analysis.createFixture();
  changed.player[0][0].cost = 2;
  assert.equal(analysis.analyze(changed, 6, []).available, false);
});
