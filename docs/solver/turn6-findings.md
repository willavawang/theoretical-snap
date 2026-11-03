# Audited turn-six findings

**Research direction, November 3:** The [capability sensitivity pilot](capability-findings.md) is complete. Earlier-turn expansion and unrestricted deck-equilibrium work are paused while we validate which modeled distinctions improve the trainer’s lessons. The engineering findings below remain the reference for these declared numerical games.

The conditional turn-six game is practical to solve directly on the measured host. The largest hand-universe control covered all **792 seven-card hands for each player**, on one reachable empty board with declared independent priors. Its LP solve took **3.63 seconds cold** and **1.41 seconds warm**, including independent verification. Cold peak resident memory was **134 MiB**. This is a useful terminal engine, not a solution of every board, earlier turn, historical belief or deck-selection equilibrium.

Recommendation: use the direct LP as the terminal reference/oracle, retain the full Game State Object externally, and build the next stage as a **coupled turn-five/six game**. Preserve complete intermediate card compositions and strategic information until further reductions are proved. Unrestricted private deck construction over all 6,188 legal deck compositions remains the overall objective; this milestone excluded none.

## Delivered

- An audited terminal representation with exact reductions and policy lifting, in `solver/endgame/`.
- A separate Python individual-card enumerator, Bayesian LP optimizer and information-constrained best-response evaluator.
- Comparison of existing CFR, new unmerged CFR and reduced CFR, using their actual averaged policies.
- Thirteen reproducible conditional cases, including hidden hands, correlated signals, rare private types, occupied lanes and broad priors.
- Complete original-action EV/mixture/loss queries against the full Game State Object, with submitted physical card IDs retained.
- A state audit, concrete history counterexamples, pinned dependencies, automated tests and a CI benchmark workflow.

The agreed rules are unchanged: twelve cards, costs/power 1–6, four available cards on turn one, later draws, seven-card cap with skipped draws left in the deck, simultaneous commitments, four slots per lane side and expiring unused energy. Passing and all legal underspending remain available. Outcome EV is P(win) − P(loss); lane-win ties use total power.

## Accuracy and independence

For a returned policy pair, the evaluators enumerate every original legal action of every supported private type. A deviation must choose the same action distribution in worlds the player cannot distinguish. Actual hidden opponent truth never replaces its declared prior.

Let U be player zero's best-response value against player one's returned policy, and L be player zero's value when player one best responds. The reported global Nash gap is U − L; exploitability is half that gap. The benchmark additionally requires the **maximum conditional private-type deviation gain** to be at most `1e-6`. This prevents a tiny average error from concealing a bad policy for a rare supported hand.

All thirteen cold LP results passed both thresholds. The largest global gap was **1.52e-14** and the largest conditional gain **4.63e-14**. The maximum difference between independently reconstructed Python and JavaScript bounds/action EVs was **2.89e-15**, including cross-checks of CFR's final averaged policies. Those small numbers describe floating-point residuals; the general results are numerical certificates for the supplied conditional model, not rational proofs or full-game certificates.

Small controls also have exact Fraction best-response bounds after rationalizing candidate probabilities and checking normalization:

| Control | Independently verified result |
| --- | --- |
| Public-hand drill | Upper and lower bounds exactly +1/5 |
| Hidden-hand trap | Exactly +1/2; solving each revealed-hand game instead gives +1 |
| Correlated private signal | Exactly +1; erasing the informative private label gives +1/2 |
| Already-won board | Exactly +1; passing has zero EV loss |
| Separate card-free one-point/two-point game | Value zero; final 1/1/1 cannot lose; equal opening probabilities unnecessary |

The rational procedure checks a candidate with exact arithmetic; it does not make the LP optimizer itself rational. The card-free control remains separate from the twelve-card game.

## Measured performance

Host: Linux x86_64, Intel Xeon Platinum 8573C, nine visible cores, Node v24.22.1, Python 3.12.14, NumPy 2.3.5, SciPy 1.17.0. LP workers request one numerical thread. These are **not M2, Safari or browser measurements**.

Cold latency includes a new Python process, dependency startup, model compilation, both LP optimizations and exhaustive verification. Warm latency is the median of two RPC measurements reusing compiled matrices but performing **new optimization and verification**. It is neither a cached equilibrium lookup nor an LP-basis warm start. With two warm repeats, these are descriptive measurements, not reliable latency percentiles. Worker startup varied considerably.

| Case | Cold ms | Warm median ms | Cold peak RSS MiB |
| --- | ---: | ---: | ---: |
| Public rational | 1,072 | 9 | 60.7 |
| Two hidden types | 482 | 15 | 61.0 |
| Rare types | 578 | 21 | 61.0 |
| Hidden-hand trap | 505 | 9 | 60.5 |
| Correlated signal | 702 | 14 | 60.5 |
| Already won | 693 | 11 | 60.0 |
| Independent aliases | 523 | 17 | 61.0 |
| Blocked lane | 1,124 | 28 | 62.7 |
| Broad asymmetric | 1,576 | 540 | 99.8 |
| All seven-card hands | 3,633 | 1,411 | 134.0 |
| Weighted seed 71 | 810 | 14 | 61.0 |
| Weighted seed 173 | 840 | 22 | 61.0 |
| Weighted seed 4901 | 3,298 | 29 | 60.8 |

The all-hand cold run spent approximately 1,929 ms compiling, 984 ms optimizing and 159 ms verifying; startup and IPC account for the remaining cold latency. The worker's high-water RSS rose to **138.9 MiB** across subsequent budget/warm runs. That includes Python, SciPy, LP matrices, action descriptions and policies; the small optimizer arrays below are not the whole process.

Optimization budgets are requests, not hard end-to-end deadlines. A single optimization/iteration, scheduling, verification or model construction can exceed them. At the warm 0.2-second LP budget, ten of thirteen cases met the target; broad-asymmetric, all-hand and weighted-seed-4901 remained provisional. All thirteen met it at the measured one- and ten-second budgets. In particular, the data do not support a guaranteed 0.2-second service.

Historical belief construction was **not timed**. The benchmark supplies declared conditional priors and records that missing cost explicitly. Solving after equilibrium-history conditioning is a separate engineering task.

## What the exact reductions save

At six energy, the global union has 400 original card-placement patterns, but at most 84 added-power vectors. Terminal actions with identical full payoff rows or columns can share additional calculations. The independent-range model combines private types with identical feasible terminal payoff-class sets; probabilities can then be lifted back to each type's legal card turns without changing any best-response value.

For the all-seven-card-hand empty-board case:

| Quantity | Before | After exact terminal reductions |
| --- | ---: | ---: |
| Private strategy types per player | 792 | 103 |
| Action-probability entries per player | 49,836 | 3,476 |
| Shared payoff matrix cells | 84 × 84 power vectors | 82 × 82 = 6,724 |

The reduced CFR's persistent regret/average arrays contain **111,232 bytes**, plus 6,724 bytes of integer payoff data. Original action descriptions and policy-lifting maps are still retained. These numbers are not a full solved-game storage estimate.

On the public drill, 40 original turns become 37 power vectors and then 35 versus 22 payoff classes. On the forced-win control, the optimizer becomes a 1×1 game while all original moves remain inspectable, including passing.

The [representation audit](turn6-audit.md) states each proof's scope. Arbitrary correlated priors retain their original private information types; equal current hands alone do not justify pooling them.

## Algorithm choice

All three CFR variants reached the strict target on three of thirteen cases within their cumulative ten-second budgets. Most nontrivial cases remained provisional at that tolerance. For the all-hand case:

| Algorithm | Global gap after about ten seconds | Maximum conditional gain |
| --- | ---: | ---: |
| Existing CFR | 0.015635 | 0.047649 |
| New unmerged CFR | 0.000411 | 0.001346 |
| Reduced CFR | 0.000325 | 0.001133 |
| Direct LP, cold solve | 2.42e-15 | Below 1e-6 |

The same-CFR raw/reduced comparison isolates the representation changes more closely than comparing different implementations. Reductions did not improve every measured CFR result: some weighted cases converged less favorably. Do not extrapolate one iteration count or one favorable case into an intrinsic complexity bound.

For these terminal games, direct LP is the recommended numerical reference. CFR remains a candidate for the larger coupled two-turn game, where its runtime, memory and error must be compared again against independently solved small controls.

## Representation findings and limits

One exactly enumerated balanced-deck five-pass family has 8,910 private opening/draw histories but only 126 current hand/deck pairs. Across all legal decks, that specific family has 6,858,432 private trajectories, 199,584 current resource states and 792 current hands. This shows that the old unmerged history table contains substantial terminal redundancy. It does not turn the old 2.45 PB history-table estimate into a minimum requirement, or establish a whole-game compression ratio.

Public history still matters when deriving beliefs. Playing one cost-1 card on turn one versus turn two, followed by passes, yields the same current board and public counts but different balanced-deck posteriors under uniform historical legal play. With fixed own resources, the resulting terminal values differ by **0.01757462**. The [reproducible counterexample](../../benchmarks/turn6/same-board-counterexample.json) has independent best-response checks; it is not an equilibrium-history claim.

At the terminal turn, the independent-type quotient proves that certain private history and unused-deck distinctions can be omitted after the prior is constructed. For earlier turns, equal hand/remaining-deck counts imply equal own future draw laws, but a full strategic quotient and a valid history-forgetting CFR policy lift remain unproved. The unrestricted offline solver's global history key is unchanged.

This milestone does not enumerate every public board, solve turns two through five, certify a broad opening policy, establish equilibrium decks, prove safe online re-solving, or estimate total full-game solved-data size. No heuristic deck exclusions were made. The general terminal engine accepts supplied valid models and independently checks each returned policy; coverage of thirteen cases is not exhaustive verification of all possible inputs.

## Next milestone and reproduction

The [turn-five/six design](turn56-design.md) specifies the next gate: a coupled two-turn public continuation tree, private ranges and exact draw rules, with an independent sequence-form LP on small hidden-card controls. Terminal payoff tables can be reused. Independently solving each child for one fixed range and inserting a constant value is insufficient: turn-five policies change the ranges reaching those children.

Keep the complete external state for replay and UI inspection. Preserve original card-turn EV rows when lifting reduced strategies. Measure historical conditioning separately from construction, optimization and verification. Do not begin trainer integration from this milestone alone.

```sh
python3 -m pip install -r requirements-turn6.txt
node --test tests/*.test.cjs tests/solver/*.test.cjs tests/endgame/*.test.cjs
python3 scripts/solver/turn6-benchmark.py
python3 scripts/solver/history-belief-control.py
node scripts/solver/turn6-solve.cjs --case hidden-trap --out benchmarks/turn6/decision-example.json
```

All **66 tests passed**, along with existing and new JavaScript syntax checks and Python compilation. The full thirteen-case benchmark completed in approximately 578 seconds. [Raw results](../../benchmarks/turn6/results.json) record case definitions by digest, source digest, hardware, individual timings, bounds and stop statuses. The measured source was based on commit `84bfa30d88bba4be6888e7845f5d3c6ce5f034d6` with source digest `3ea4b5cf6d9bd3b8bae027762d20db912ed55e93b6c8c692ff97323b6e3b8d03`; the digest identifies the new benchmark code before its containing commit existed. No frontend files were changed.
