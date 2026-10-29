# Numerical Snap playing solver

The engine models the numerical game, including private decks, hands and future draws. It computes approximate playing equilibria for supplied distributions. Broad early-game runs still reach resource limits before establishing equilibrium; see [engineering findings](engineering-report.md).

## Implemented rules

| Rule | Behavior |
| --- | --- |
| Cards | Twelve per deck; costs 1–6; power equals cost; duplicates allowed |
| Opening and draws | Three opening cards plus one draw at the start of each turn; four available on turn one |
| Hand limit | Seven; a full hand skips its draw, leaving that card in the deck |
| Turns and energy | Six; energy equals turn; unused energy expires |
| Board | Three neutral lanes; four cards per player per lane |
| Commitment | Simultaneous complete turns; reveal both before the next draw |
| Legal choices | All affordable card multisets and lane assignments, including passing |
| Scoring | More lane wins; ties use total power; exact total tie draws |
| Utility | Win +1, draw 0, loss −1; EV = P(win) − P(loss) |
| Excluded | Abilities, special locations, cubes, snapping and retreating |

Identical copies are interchangeable. Different compositions remain distinct, including 6 versus 2+4, because they consume different cards and slots. Reveal order has no effect in this numerical model.

Both players optimize under the same rules. Neither information key includes the other hand, other remaining deck, other private draws, or the pending simultaneous commitment. Public revealed history and public hand/deck counts are observable. Each player remembers its own initial private type and subsequent draws.

## Files and execution

- `dist/solver/engine.js`: dependency-free browser/Node UMD engine.
- `dist/solver/ranges.js`: deck priors, exact draw enumeration and history conditioning.
- `dist/solver/worker.js`: asynchronous protocol, cancellation and local checkpoint cache.
- `dist/solver.html`: isolated workbench; preserves the accepted trainer board.
- `tests/solver/`: independent mathematical fixtures, information boundaries, hidden draws and Worker protocol.
- `scripts/solver/benchmark.cjs`: cold/warm time, convergence, memory and checkpoint measurements.

```sh
npm test
npm run benchmark:solver
npm run dev
# http://127.0.0.1:4173/solver.html
```

No external numerical library or build step is needed. The standalone trainer export does not bundle the separate Worker workbench; serve the files from `dist/`.

## Public model and private query

The root is immediately after the current turn's draw and before either commitment. Supply the public board as card-cost arrays and a private-type range for each player.

```js
const S = require('./dist/solver/engine.js');
const R = require('./dist/solver/ranges.js');
const model = R.hiddenFixture();
const solver = new S.Solver(model, {
  seed: 17, maxInfoStates: 25000, maxTreeNodes: 50000
});
solver.run({iterations: 10000, maxMs: 1500, targetGap: 0.01});
const review = solver.analyze(model.ranges[0][0], {
  targetGap: 0.01, mistakeThreshold: 0.02, samplesPerAction: 128
});
```

The shape is `{turn, board: [player0Lanes, player1Lanes], ranges: [player0Types, player1Types]}`. Each private type is `{hand: [costs], remaining: [costs], weight: 1}`; weights are normalized and zero-weight types omitted. Its original deck is its current hand plus remaining deck plus its public board cards. `query.player` selects player 0 or 1. A query must have positive mass in its public range.

An actual hand is queried separately. If the player privately knows it selected Balanced while the opponent only knows a deck distribution, keep all possible player deck types in that public root. Replacing the player's whole range with the actual hand would give the opponent forbidden knowledge. Queries never change training or the opponent policy.

Correlated priors use `cases: [{players: [private0, private1], weight}]` instead of ranges. Hypotheses must agree on public hand/deck counts. Deck size, hand limit, lane capacity, feasible past energy and past draw counts are validated. Explicit ranges do not infer strategic likelihoods of previous decisions.

An optional private-type `observations` string retains remembered private histories in conditioned roots. The reference updater produces it automatically. Research-only `rules: {turns: 2, deckSize: null}` supports small independent tests; production defaults remain six turns and twelve cards.

## Deck distributions and historical beliefs

```js
const opening = R.fromDecks({
  decks: [
    [{name: 'balanced', weight: 3}, {name: 'low', weight: 1}],
    [{cards: S.PRESETS.midrange, weight: 1}]
  ]
});
```

`decks[player]` is a public distribution over privately known own decks. Defaults are equal weights over the three existing UI presets for both players. This does not automatically enumerate every possible deck composition. Draw probabilities use exact multiset counts without replacement.

For midgame roots, supply `turn` and `history`, with one `{plays: [player0Lanes, player1Lanes]}` per previous turn. Default `historyPolicy: 'uniform'` weights each observed action by its probability under uniform legal historical play. This is an explicit reference model, not equilibrium inference. `'card-consistency'` omits strategic play likelihoods and is labeled accordingly.

```js
const continuation = R.fromReferencePolicy(fullGameSolver, publicHistory, {
  tremble: 0.01, maxPrivateHistories: 50000
});
```

This conditions exactly on the supplied averaged full-game policy and preserves private histories. It currently requires an empty-board independent-prior turn-one reference. Unvisited reference states extend uniformly and are counted in `rangeMetadata.uniformFallbackLookups`. Zero-probability histories fail unless a positive explicit uniform tremble is specified. Exceeding the history cap fails rather than silently removing histories.

A small Nash gap in a continuation does not certify a full-game strategy when that policy is grafted back into another game. Safe re-solving requires additional opponent-value constraints, not implemented here.

## Algorithms and measured accuracy

| Path | Use | Accuracy measurement |
| --- | --- | --- |
| Bayesian matrix CFR+ | Final turn | Exhaustive information-constrained best responses |
| Full-tree CFR | Small sequential games | Complete chance tree; one deviation shared across each information set |
| Outcome-sampling MCCFR | Larger continuations | Importance-corrected sampled updates; no exhaustive certificate at current budget |

Automatic selection tries matrix solving on the final turn, bounded full-tree solving with two turns remaining, and otherwise sampling. Explicit `algorithm: 'matrix' | 'full' | 'sampled'` is available. Full-tree solving also supports earlier starts if explicitly selected and within budget.

For final independent priors, a lossless optimization shares the public action-payoff matrix and aggregates opponent action mass across private types. Each type keeps its own legal actions, regrets and strategy. Correlated cases use the general conditional calculation.

Matrix CFR+ uses alternating regret updates and a linearly weighted average. Full-tree CFR uses cumulative regret and reach-weighted averaging. Outcome sampling uses full-support exploration for the updating player and importance correction for regrets and averages. Chance and opponent actions are sampled; unvisited strategies are uniform. Training samples full legal continuations rather than replacing later turns with a heuristic payoff.

`diagnostics.certified` means exhaustive numerical deviation bounds were calculated, not that they are small. Nash gap is the sum of both players' best-response gains; exploitability is half that gap. `maxConditionalGain` is the worst conditional root-type deviation gain, preventing a small global average from concealing an untrained rare root hand.

`analysis.strategyValidated` requires both bounds at most `targetGap` (default 0.01 outcome EV). This is numerical approximation, distinct from the trainer's exact rational teaching fixture. It applies to the supplied continuation and root types, not every rare future history.

`analyze` returns all complete root turns with frequency, EV, W/D/L, EV loss, uncertainty and grade. Default mistake tolerance is 0.02 EV. Frequency alone never makes an individual move incorrect. Values use the same averaged opponent and continuation policies. Sampled rollouts use common random numbers and a simultaneous 95% Hoeffding error bound; EV-loss intervals allow both action errors. Large sampled runs remain provisional without a measured convergence bound.

## Resource limits and checkpoint cache

`run` accepts an iteration count, training time budget and accuracy target. Setup, action evaluation, serialization and an in-progress iteration can exceed the training budget. The browser Worker keeps computation off the UI thread; Stop terminates it.

`maxInfoStates`, `maxTreeNodes` and `maxMatrixCells` bound expansion. A budget stop does not remove legal choices and declare the smaller game solved. Sampled memory-cap stops are provisional.

`snapshot()` stores regrets, averages, RNG state and deduplicated action metadata. `restore(snapshot)` resumes the identical model; exact resumption is tested. Version, full model fingerprint and algorithm mismatches are rejected. These are internal checkpoints, not an untrusted interchange format.

The Worker hashes the fingerprint and algorithm with SHA-256, verifies the complete fingerprint on restore, and retains six recent IndexedDB policies. Rules, board, starting turn and both public belief ranges are part of the identity; the actual private query is separate. All supported private-hand queries can reuse that same public-root policy. Changed beliefs need another entry.

This is an exact-position cache, not a global blueprint, symmetry cache or general subgame database. A larger state budget can continue a resource-limited checkpoint; caching alone does not establish convergence.

## Reproducing measurements

`npm run benchmark:solver` records three repeats of seven fixed cases, a 1.5-second training budget and 25,000-state cap. Override `SNAP_BENCH_REPEATS` or `SNAP_BENCH_MS`. Reports include hardware, engine source hash, root-type counts, both deviation bounds, cold/warm time, stop reason, retained-memory deltas and checkpoint sizes.

**Benchmark this browser** runs comparable examples in the browser Worker and downloads the device report. Cold runs bypass existing cache; warm time is unavailable when a checkpoint cannot be written and read. Worker protocol tests run under Node VM. Actual browser/IndexedDB integration, layout and physical-device latency remain unverified until measured there.

Node time is not a browser latency promise. Fixed examples do not establish a worst-case runtime for every position.

## References

This is an original implementation of published CFR/CFR+ and outcome-sampling MCCFR methods. [OpenSpiel's outcome-sampling source](https://github.com/google-deepmind/open_spiel/blob/master/open_spiel/python/algorithms/outcome_sampling_mccfr.py) was used as a primary reference for importance-corrected updates. It does not claim to reproduce GTO Wizard's proprietary implementation.
