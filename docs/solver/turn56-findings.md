# Coupled turns-five/six findings

The recommended next engine is implemented: a conditional game that optimizes **turns five and six together**, with a separate sequence-form LP reference, public-tree CFR candidate, independent deviation checks and reusable strategy profiles. The same Game State Object can be queried before either remaining turn.

Nine declared hidden-information games passed the independent LP accuracy target. On the user's **Apple M2 with 16 GiB RAM**, the largest tested four-type-per-player game took **2.81 seconds cold** and **1.56 seconds warm**. Cold reference peak memory was **354 MiB**, rising to **623 MiB** over subsequent budget/warm runs. This completes the small-game implementation/verification gate in the saved design. It does not solve the unrestricted opening game or enumerate every endgame board/range.

## What now works

- Both players optimize turn-five actions and all turn-six continuations in one game. Public action likelihoods change the continuation ranges during optimization.
- All affordable card subsets and legal placements, including passing and underspending, remain available. Unused turn-five energy does not carry over.
- Full hands skip the turn-six draw and keep the skipped card in the deck; playing can create room to draw. Draws are without replacement.
- Intermediate equal-power plays remain distinct when their hand or slot consequences differ. Terminal power-equivalent actions share computation and are lifted back to original card turns.
- Both independent and correlated priors retain the appropriate private information. Private histories are preserved at the two-turn level.
- Saved profiles contain the complete public model, private-information-indexed strategy, fingerprints and bounds. They can answer different private-hand queries and both remaining turns without new optimization.
- Complete state queries preserve physical card IDs, return original-turn EVs/frequencies/losses and retain the state for replay. Actual opponent truth never replaces its public prior.

The frontend is unchanged. There is no new unrestricted training run, deck exclusion, or full-game private-history-key change.

## Independent verification

The Python reference enumerates individual physical-card assignments, constructs perfect-recall sequence flows and solves both players' coupled zero-sum LPs. It independently evaluates each returned strategy pair using complete, information-constrained deviations across both turns. The JavaScript engine separately reconstructs public branches, chance outcomes, payoff tables and best-response values.

The target requires both the global Nash gap and maximum conditional **root-private-type** full-continuation deviation gain to be at most `1e-6` outcome EV. All nine cold LP results passed. Maximum observed residuals were:

| Check | Maximum |
| --- | ---: |
| LP global Nash gap | 2.78e-16 |
| LP conditional root-type gain | 2.23e-16 |
| LP reached-continuation gain diagnostic | 1.57e-16 |
| Python/JavaScript bound and root action-EV disagreement | 5.56e-16 |

These are numerical residuals, not rational-arithmetic proof bounds. The independent symmetric control has value zero, and the forced-win control has value +1 with passing optimal. Existing exact rational single-turn and card-free controls remain in the regression suite. See [the mathematics](turn56-mathematics.md) for the information partition, flow equations, CFR averaging and verification method.

## Measured M2 cost

Hardware/runtime: Apple M2, eight logical cores, 16 GiB RAM, macOS 15.7.3, Node v18.15.0, Python 3.11.2, NumPy 2.3.5 and SciPy 1.17.0. LP workers request one numerical thread. The final timing run followed the tests, rather than competing with them. These are native engine timings, not Safari timings.

Cold includes fresh reference-process startup, compilation, both LP solves and verification. Warm is the median of two new optimization/verification RPCs on the same compiled sequence-form tree; it is neither an equilibrium lookup nor a reused LP basis. Two repeats give descriptive measurements, not latency percentiles.

| Conditional game | Private types per side | Cold ms | Warm median ms | Cold LP peak MiB |
| --- | --- | ---: | ---: | ---: |
| Symmetric draws | 2 / 2 | 300 | 22 | 71.0 |
| Asymmetric draws | 2 / 2 | 299 | 23 | 71.0 |
| Composition and capacity | 2 / 2 | 379 | 51 | 87.5 |
| Full-hand skip | 2 / 2 | 503 | 105 | 111.5 |
| Rare types | 2 / 2 | 302 | 22 | 71.5 |
| Correlated labels | 2 / 2 | 281 | 13 | 68.1 |
| Forced win | 1 / 1 | 253 | 3 | 65.2 |
| Mixed resources | 2 / 2 | 1,431 | 687 | 224.4 |
| Four types | 4 / 4 | 2,811 | 1,560 | 353.7 |

The four-type cold run spent about 955 ms compiling, 1,514 ms optimizing and 46 ms verifying. The rest was process/IPC overhead. Repeated runs reached 623.3 MiB process high-water RSS; the cold figure is not a persistent-worker memory ceiling. The CFR worker's corresponding reported peak was about 263 MiB. Raw Node RSS and selected units are retained to audit the Darwin/Linux normalization.

Historical belief construction remains **unmeasured**. Inputs here are declared conditional priors. These results do not include the cost of deriving them from an opening-equilibrium policy.

## Representation size and scaling

The four-type game contains 1,360 feasible public turn-five commitment pairs and 6,336 total information sets. The reference uses 28,761 and 28,811 realization sequences and 588,736 nonzero payoff coefficients. It avoids enumerating every complete contingent pure strategy.

The public-tree candidate retains 56,534 strategy-action entries, approximately 904,544 bytes of persistent regret/average numbers, and 172,061 bytes of shared integer terminal payoff tables. Original action descriptions, reverse maps, node objects and runtime dependencies account for additional memory. The full compact behavioral-policy JSON alone is about **3.16 MB**; the supplied example profile is for the smaller asymmetric case.

These are sizes for one explicit conditional game. They are not a solved-data estimate for every board, private deck or historical belief. The old 2.45 PB unmerged-table estimate remains distinct from a lower bound on possible structured solutions. No full-game compression ratio follows from this experiment.

## LP versus CFR and deadlines

At the measured 0.2/1/10-second warm LP optimization budgets, respectively **7/8/9 of nine** cases met the target. The four-type one-second run was provisional, with a global gap about 0.68; a requested budget must never turn that output into a GTO label.

The CFR candidate met the whole-two-turn target on **six of nine** cases within its requested cumulative ten-second budget. The full-hand, mixed-resource and four-type cases remained provisional. Their final global gaps were approximately `4.42e-5`, `7.53e-4` and `3.14e-4`. The full four-type best-response check also found maximum conditional root-type gain about `6.33e-4`.

Budgets are soft: construction, verification, scheduling and an in-progress iteration/solve can exceed them. The four-type CFR run used about 11.7 seconds of cumulative optimization/checking for its requested ten-second sequence. Raw actual times and stop reasons are recorded. For these measured conditional games, **direct LP remains the recommended default/reference**. The public-tree candidate provides a reusable architecture and measured comparison, rather than a claim of universal speed superiority.

## Local turn-six accuracy is a separate check

A small whole-game gap can conceal a poor strategy in an extremely rare later history. For example, the symmetric CFR run met the root target while its maximum reached-continuation gain diagnostic was about 0.0126. The asymmetric run's diagnostic was about 0.0827. Root validation alone must not grade those individual later decisions as validated.

The new query adapter therefore derives the public turn-six posterior using turn-five strategy likelihoods and transfers the returned child policies into the existing independent terminal evaluator. A turn-six result is marked validated only if that local game also meets its target. Tests include a tiny-exploration example where the parent passes while a newly reached child fails.

The displayed turn-five action EV convention also matters: it uses the same frozen returned continuation policy for every action. The separate `bestResponseEV` optimizes the querying player's later actions against the same fixed opponent strategy. Off-support continuation policies can be nonunique; those two values need not agree for a hypothetical root move. There is no claim of a uniquely refined equilibrium at every zero-probability history.

When a public commitment has zero profile reach, the engine does not infer its missing posterior from stored hidden cards. A well-defined one-sided counterfactual can be shown provisionally. An opponent commitment with zero conditional reach returns unavailable until an explicit off-policy belief assumption is supplied.

## Reuse and the next engineering decision

The [recorded turn-five decision](../../benchmarks/turn56/decision-example.json), [saved strategy](../../benchmarks/turn56/reference-profile.json) and [turn-six decision](../../benchmarks/turn56/turn6-decision-example.json) demonstrate the complete state/profile handoff. The turn-six command restores the same strategy without new optimization and independently rechecks it. Library callers can retain the compiled objects; the CLI's restore still pays independent reconstruction/verification cost.

The next scaling gate should broaden declared turn-five ranges and public-board geometries under explicit construction limits, measuring how information sets, sparse LP coefficients and local residuals grow. Include reach distributions from specified historical policies so belief construction gets its own measured cost. Keep any heuristic exclusions reversible and independently test omitted candidates as deviations.

Extending another turn should retain the same coupled information structure, and start with a small independent sequence-form reference before training a larger public-tree candidate. Do not assume that the 103-class terminal hand quotient is a valid nonterminal abstraction. Prove any further state merging or forced-outcome bounds before applying them permanently.

Unrestricted private construction over all **6,188** legal deck compositions remains the opening-game objective. None were permanently removed. The present conditional ranges are experimental boundary conditions, not established equilibrium decks. Trainer integration, safe opening-game re-solving, cubes and a certified six-turn strategy remain outside this milestone.

## Reproduce

Use [the API guide](../../solver/two-turn/README.md) and [evidence index](../../benchmarks/turn56/README.md). The full local benchmark completed in approximately 57 seconds; `--quick` reproduces four small controls. Tests cover the independent LP agreement, chance rules, composition/slots, hidden information, realization averaging, complete best responses, rare private types, posterior likelihoods, local validation, physical IDs, profile identities, resource stops and memory units.

Source base: `83371749e56f641649531fb8942dabd20b1389f4`; measured new-source digest: `ec1347959016ad4f032988dd3b59ccd5267a3870e92a8a5035c915b73beac355`. [Raw results](../../benchmarks/turn56/results.json) include exact case/source digests, timing phases, bounds, statuses, memory scope and runtime metadata. All **84 tests passed locally** in one combined run, together with existing/new JavaScript syntax checks and Python compilation. CI repeats the existing 66 cases and 18 new cases plus the small and four-type benchmarks.
