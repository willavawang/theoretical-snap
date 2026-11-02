# Recommended turn-five/six extension

The completed milestone supports a range-aware public-tree continuation solver, with an independent small-game sequence-form LP as its reference. It does not support another expansion of the unmerged full-game training table.

## Retain three layers

1. The existing full Game State Object supplies factual cards, IDs, hidden truth and replay.
2. A declared public belief model supplies distributions over the players' private states. Conditioning on a historical reference strategy is a distinct operation with its own provenance and budget.
3. A solver representation combines the public continuation tree with private-resource distributions and terminal payoff classes. It does not create an independent payoff matrix for every joint hidden world.

The numerical game can use independent range operations when the independent-deck factorization assumptions hold. Explicit correlated input cases retain the joint distribution and original information partition.

## First two-turn control suite

Use genuine turn-five starts, initially with two to four private types per player and one or two remaining drawable costs. Include:

- Different affordable card compositions yielding the same immediate power but different future hands and slots.
- A five-cost play versus reserving resources for turn six.
- A full hand that skips its last draw after passing, but makes room to draw after playing a card.
- All remaining draw costs, including the skipped-draw event; draws are without replacement and skipped cards stay in the deck.
- Correlated-private-information controls and asymmetric priors.
- Rare supported private types, reported separately from the global weighted Nash gap.

Preserve full private observation history in these controls until a sequential quotient is proved. Use the card-free one-point/two-point game only as an additional known-answer control. It cannot substitute for hidden-card tests.

## Independent reference and candidate

The reference should construct a finite two-turn sequence-form game and solve its coupled realization-plan LP. It must share one decision across histories a player cannot distinguish. It must independently evaluate the resulting policies' deviations and chance events.

The candidate should use public-tree CFR with vectorized private ranges and shared terminal payoff data. At turn five, keep full card compositions and lane occupancy effects. Following the public joint reveal, propagate every compatible private draw into turn-six information states. The turn-six compiler's integer payoff tables and lifting rules can be reused; type weights and legal sets come from that particular conditional continuation.

Crucially, do **not** precompute each turn-six child's equilibrium for one fixed range and insert its scalar value as an immutable turn-five leaf. The conditional ranges after a public turn-five action depend on the strategies being optimized. Such isolated solves need not form an equilibrium of the parent game. A coupled two-turn solver or a justified range-dependent value formulation must preserve those dependencies.

The new terminal LP is a numerical oracle and a validation tool. The candidate's inner iterations should reuse terminal payoff matrices and counterfactual value vectors, rather than repeatedly starting two standalone LP processes for every branch. A later public-belief/value learner can use these exact-model endgames for targets, but a neural approximation is not required by this milestone's results.

## State-key decision

Use the full public commitment history in the initial two-turn reference. Keep own current hand/remaining counts and remembered private observations. Separately measure candidate resource-state equivalences; adopt a sequential merge only with a proof and independent best-response tests. The terminal 103-class result is not a valid turn-five hand bucket by itself.

Terminal cache keys must include the declared belief model and numerical weights, not just power and slots. The current canonical key is conservative: it recognizes lane permutations and independent terminal payoff-resource equivalences, but it does not claim to minimize every possible conditional-game representation.

## Useful future path bounds

Energy rules can produce admissible optimistic bounds on future power. Tighten these using remaining cards, chance support and empty slots. A branch can terminate early if every legal continuation has the same match utility. Bounds must preserve total-power tie breaking as well as lane wins.

These bounds may help prove forced outcomes or avoid calculations. They do not justify the assumption that all energy must be spent, nor excluding a deck merely because it cannot reach one impressive final board. Permanent deck exclusions still require suitable full-game dominance or certified bounds; no such exclusion was proved here.

## Next decision gate

Before broadening the two-turn universe, require agreement with the independent reference on equilibrium value, global Nash gap and maximum supported-type deviation gain. Compare action EVs against the same frozen opponent policy; valid equilibria may have different mixtures and off-support action values.

Measure construction, historical conditioning, optimization, verification, cold/warm latency and peak memory separately. Use the terminal benchmark's 0.2/1/10-second budgets as experiments rather than assuming that its fastest timings transfer to two turns or to Safari on the user's M2.

Keep all 6,188 private deck compositions available in the eventual opening game. A small distribution in a control is an experimental boundary condition, not a permanent candidate-deck exclusion or an established equilibrium deck list.
