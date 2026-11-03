/* Exact, finite public-hand teaching game. No hidden-hand or multi-turn solver. */
(function (root) {
  "use strict";
  const HAND = [1, 2, 4, 6];
  const PLAYER = [[1], [2, 3], [4, 5]];
  const OPPONENT = [[1, 5], [4], [2, 3]];
  const DENOMINATOR = 5;
  const rotate = (lanes, rotation) => lanes.map((_, i) => lanes[(i - rotation + 3) % 3]);
  const total = cards => cards.reduce((sum, card) => sum + card.cost, 0);
  const key = plan => plan.map(item => `${item.id}:${item.lane}`).sort().join("|");

  function createFixture(rotation = 0) {
    rotation = ((rotation % 3) + 3) % 3;
    const board = (values, owner) => rotate(values, rotation).map((cards, lane) => cards.map((cost, i) => ({ cost, id: `${owner}-${lane}-${i}` })));
    return {
      player: board(PLAYER, "solved-p"), opponent: board(OPPONENT, "solved-o"),
      hand: HAND.map((cost, i) => ({ cost, id: `solved-hand-${i}` })),
      opponentHand: [...HAND], analysisKey: "public-hand-v1", rotation, custom: false,
    };
  }

  function legalPlans(scenario, turn, side = "player") {
    const hand = side === "player" ? scenario.hand : scenario.opponentHand.map((cost, i) => ({ cost, id: `opponent-hand-${i}` }));
    const occupancy = scenario[side].map(cards => cards.length);
    const plans = [];
    function visit(index, spent, plan) {
      if (index === hand.length) { plans.push(plan); return; }
      visit(index + 1, spent, plan);
      const card = hand[index];
      if (spent + card.cost > turn) return;
      for (let lane = 0; lane < 3; lane++) {
        if (occupancy[lane] >= 4) continue;
        occupancy[lane]++;
        visit(index + 1, spent + card.cost, [...plan, { id: card.id, lane, cost: card.cost }]);
        occupancy[lane]--;
      }
    }
    visit(0, 0, []);
    return plans;
  }

  function additions(plan) {
    return [0, 1, 2].map(lane => plan.filter(item => item.lane === lane).reduce((sum, item) => sum + item.cost, 0));
  }

  function outcome(scenario, player, opponent) {
    const ours = scenario.player.map(total).map((value, lane) => value + player[lane]);
    const theirs = scenario.opponent.map(total).map((value, lane) => value + opponent[lane]);
    const lanes = ours.reduce((sum, value, lane) => sum + Math.sign(value - theirs[lane]), 0);
    return Math.sign(lanes || (ours.reduce((a, b) => a + b, 0) - theirs.reduce((a, b) => a + b, 0)));
  }

  function mixtures(rotation) {
    return {
      player: [
        { power: rotate([6, 0, 0], rotation), weight: 2 },
        { power: rotate([0, 6, 0], rotation), weight: 1 },
        { power: rotate([0, 4, 2], rotation), weight: 2 },
      ],
      opponent: [
        { power: rotate([0, 6, 0], rotation), weight: 1 },
        { power: rotate([0, 0, 6], rotation), weight: 2 },
        { power: rotate([2, 4, 0], rotation), weight: 2 },
      ],
    };
  }

  function matchesFixture(scenario, turn) {
    if (turn !== 6 || scenario.analysisKey !== "public-hand-v1" || !Number.isInteger(scenario.rotation)) return false;
    const expected = createFixture(scenario.rotation);
    const values = board => board.map(cards => cards.map(card => card.cost).sort((a, b) => a - b));
    return JSON.stringify(values(scenario.player)) === JSON.stringify(values(expected.player)) &&
      JSON.stringify(values(scenario.opponent)) === JSON.stringify(values(expected.opponent)) &&
      JSON.stringify(scenario.hand.map(card => card.cost).sort((a, b) => a - b)) === JSON.stringify(HAND) &&
      JSON.stringify([...(scenario.opponentHand || [])].sort((a, b) => a - b)) === JSON.stringify(HAND);
  }

  function analyze(scenario, turn, submitted) {
    const unavailable = { available: false, reason: "This position has no validated analysis." };
    if (!matchesFixture(scenario, turn)) return unavailable;
    const candidates = legalPlans(scenario, turn);
    const opponents = legalPlans(scenario, turn, "opponent");
    const mix = mixtures(scenario.rotation);
    const evNumerator = power => mix.opponent.reduce((sum, reply) => sum + reply.weight * outcome(scenario, power, reply.power), 0);
    const maximum = Math.max(...candidates.map(plan => evNumerator(additions(plan))));
    const minimum = Math.min(...opponents.map(plan => mix.player.reduce((sum, action) => sum + action.weight * outcome(scenario, action.power, additions(plan)), 0)));
    // All payoffs, weights, and bounds are integers over denominator five.
    // This is a rational certificate, not a floating-point solver tolerance.
    if (maximum !== 1 || minimum !== maximum || candidates.length !== 40 || opponents.length !== 40) return unavailable;
    const chosen = candidates.find(plan => key(plan) === key(submitted));
    if (!chosen) return unavailable;
    const evaluate = plan => {
      const power = additions(plan);
      const wdl = [1, 0, -1].map(result => mix.opponent.reduce((sum, reply) => sum + (outcome(scenario, power, reply.power) === result ? reply.weight : 0), 0));
      const ev = wdl[0] - wdl[2];
      return Object.freeze({ plan: plan.map(item => Object.freeze({ id: item.id, lane: item.lane })), power, evNumerator: ev, lossNumerator: maximum - ev, wdl });
    };
    const preference = [[6, 0, 0], [0, 4, 2], [0, 6, 0]].map(power => rotate(power, scenario.rotation).join(","));
    const rank = action => {
      const index = preference.indexOf(action.power.join(","));
      return index < 0 || action.plan.length !== [1, 2, 1][index] ? 3 : index;
    };
    const alternates = candidates.filter(plan => key(plan) !== key(chosen)).map(evaluate).sort((a, b) => b.evNumerator - a.evNumerator || rank(a) - rank(b) || a.plan.length - b.plan.length || key(a.plan).localeCompare(key(b.plan))).slice(0, 3);
    const yours = evaluate(chosen);
    const best = candidates.map(evaluate).sort((a, b) => b.evNumerator - a.evNumerator || rank(a) - rank(b) || a.plan.length - b.plan.length)[0];
    const branches = mix.opponent.map(reply => ({
      ...reply, yours: outcome(scenario, yours.power, reply.power), alternate: outcome(scenario, best.power, reply.power),
    })).sort((a, b) => b.weight * (b.alternate - b.yours) - a.weight * (a.alternate - a.yours));
    return Object.freeze({ available: true, denominator: DENOMINATOR, maximumNumerator: maximum, yours, alternates, best, branch: branches[0], candidateCount: candidates.length, opponentMix: mix.opponent });
  }

  const api = Object.freeze({ createFixture, legalPlans, additions, outcome, analyze });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SnapAnalysis = api;
})(typeof window === "undefined" ? globalThis : window);
