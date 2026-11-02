# Audited conditional final-turn solver

This backend solves a supplied-range final-turn Bayesian game. It does not change the trainer or the unrestricted offline training key, and it does not declare a full-game equilibrium.

Install the independent LP reference:

```sh
python3 -m pip install -r requirements-turn6.txt
```

Run the mathematical controls and reproduce measurements:

```sh
npm run test:endgame
python3 scripts/solver/turn6-benchmark.py
```

The full benchmark writes `benchmarks/turn6/results.json`. It compares the existing matrix CFR, the new unmerged CFR and the new reduced CFR at cumulative 0.2/1/10-second optimization budgets, as well as independent LP solutions. Startup, compile, optimization, verification and process peak RSS are reported separately. Historical belief conditioning is **not** included: the inputs are declared conditional priors. Current measurements are Linux/Node/Python, not browser or M2 results.

Solve a named control or a custom JSON model:

```sh
node scripts/solver/turn6-solve.cjs --case hidden-trap --out artifacts/endgame/example.json
node scripts/solver/turn6-solve.cjs --model my-final-turn-model.json --seconds 10
node scripts/solver/turn6-solve.cjs --case public-rational --method cfr --seconds 1
```

Models use the existing `turn`, `board[player][lane]` card arrays, rules, and either `ranges[player]` or weighted joint `cases`. Both players' public ranges are supplied. A type contains `hand`, `remaining`, optional string `observations` and a nonnegative numerical `weight`. Public hand/deck counts must agree across hypotheses. The production numerical model has twelve cards, seven-card hand limit and six turns. Separate controls can use a shorter horizon or `deckSize: null`; these controls are explicitly labeled.

`--game-state FILE --placements FILE --player P --type I` analyzes a recorded Game State Object with the specified public conditional model. Its public board and the selected player's private resources must match. Without those files the CLI exports a complete illustrative state and submits a legal move. The illustrative opponent truth is stored for replay; the solver uses the public prior, not that truth.

## Modules

- `model.cjs`: independent submultiset/placement enumeration, shared lane relabeling, terminal power and payoff-row equivalence, independent-type pooling, and policy lifting.
- `cfr.cjs`: deterministic matrix CFR+ with linear averaging; returns the averaged policy.
- `verify.cjs`: legacy action enumeration plus independently reconstructed terminal payoffs and exhaustive information-constrained best responses.
- `query.cjs`: original card-turn EVs, loss, mixing frequencies and physical card IDs for the existing state contract.
- `audit.cjs`: finite private-history and posterior counterexamples, with explicit policy assumptions.
- `cases.cjs`: reproducible declared priors, legal boards and exact controls.
- `scripts/solver/turn6_reference.py`: independent individual-card enumeration, two behavioral LPs using HiGHS, a separate best-response evaluator, and exact Fraction verification of small rationalized controls.

Correlated priors retain their original information types. Pooling is applied only to independent conditional priors. Original actions are retained for EV inspection even when the optimizer shares their payoff class. Within one returned class, probability is split uniformly over the available original moves; it is one valid lifted mixture, not a unique equilibrium frequency.

See [state audit](../../docs/solver/turn6-audit.md), [findings](../../docs/solver/turn6-findings.md) and [turn-five/six design](../../docs/solver/turn56-design.md).
