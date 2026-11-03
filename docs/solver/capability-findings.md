# Which distinctions earn a place in the trainer?

The bounded pilot supports developing **private capability menus with selected meaningful effects**, while retaining the numerical solver as a reference. Detailed numerical hands contributed little unavoidable strategy difference relative to the tested coarser menus. Unrestricted allocation produced larger differences. The effect controls demonstrated why a single card’s energy cost cannot identify which lanes it threatens.

This is evidence about decisions inside declared games. It does not establish improvement in actual Marvel Snap play. Turns one through four and unrestricted numerical deck equilibrium remain paused.

## Study and evidence

The fixed primary panel is six reachable turn-six numerical boards, each under two invented independent opponent priors. The same own range is used throughout: [1,2,4,6] and [2,2,2,6], equally weighted. Each of seven opponent hand types can spend six energy. Passing and underspending remain legal. Both players optimize within their private choice sets; a type prior never prescribes an opponent move.

| Arm | Representation | Interpretation |
| --- | --- | --- |
| D | Existing physical-card numerical oracle | Reference game |
| Q | Equivalent terminal payoff rows, columns and private menus | Exact representation of D |
| C | Group by maximum power, maximum simultaneous lanes and lane access; grant union menus | Deliberately broader capabilities |
| U | Every integer allocation up to six into nonfull lanes | Deliberate additive relaxation |

C retains private types and optimized choices, with three opponent menu classes in the first board instead of seven numerical hands. U gives every opponent the full allocation menu. Neither is a real-Snap forecast.

Source commit: **ec4193198f683cab93eeb64f5f8be8bf24949544**. See the [reproduction instructions](../../studies/capabilities/README.md), [fixed design](../../studies/capabilities/spec.md), [manifest and numerical bounds](../../studies/capabilities/results/manifest.json), [effect controls](../../studies/capabilities/results/controls.json), and [twelve case files](../../studies/capabilities/results/cases/). The [successful CI run](https://github.com/willavawang/theoretical-snap/actions/runs/41718577234) also retains the full report artifact. The manifest records the original full-report hash; the saved split evidence contains the same data.

All **48 primary solves** passed independent original-action evaluations. Global Nash gap and maximum conditional private-type deviation gain were below 8e-16, against a requested 1e-6 tolerance. Python reconstructs bodies and effects independently of JavaScript, and the JS verifier checks every original menu action. The existing individual-card solver additionally checks D. Q preserved the game value and every original action EV under the same frozen policy.

Shared-policy and ranking LPs also have recomputed numerical primal/dual bounds, including residual stationarity over bounded variables. These are floating-point checks, not exact rational proofs. All **100 tests** passed: 84 existing tests, seven JS representation/effect controls, and nine independent Python controls.

## Detailed numerical hands had limited decision value here

Comparing whichever equilibrium each solver returned would exaggerate sensitivity. Instead, for each board/prior, we optimized one own private-hand policy across multiple models.

For target game m, security loss is its optimal guaranteed value minus the imported policy’s value against that game’s best opponent response. The opponent averages over our hidden hand before choosing its response. The shared-policy LP minimizes the maximum loss across the target games. Thus each EV loss is measured within its own game; raw EVs across different games do not measure teaching quality.

| Board | Opponent prior | Best common policy: D/C maximum loss | D/C/U maximum loss |
| --- | --- | ---: | ---: |
| Uneven race | Concentrated | 0 | 0.0750 |
| Uneven race | Flexible | 0 | 0 |
| Close races | Concentrated | 0.01425 | 0.14974 |
| Close races | Flexible | 0 | 0 |
| One leading lane | Concentrated | 0 | 0.03529 |
| One leading lane | Flexible | 0 | 0 |
| Balanced board | Concentrated | 0.01425 | 0.14974 |
| Balanced board | Flexible | 0 | 0 |
| Our full lane | Concentrated | 0 | 0 |
| Our full lane | Flexible | 0 | 0 |
| Their full lane | Concentrated | 0 | 0 |
| Their full lane | Flexible | 0 | 0 |

For D/C, **all twelve settings admit a common strategy within 0.01425 outcome EV of each game’s optimum**. Ten have zero loss to numerical precision. The maximum compromise is below the preregistered 0.02 reporting threshold. That threshold is a convention, not an educational validation.

This is an aggregate policy guarantee over the declared two-hand own prior. It does not say every individual move is equivalent, authorize merging these hands at earlier turns, or establish that numerical hands can always be discarded.

A particular exported D strategy nevertheless lost up to **0.35** security EV when imported into C. In the flexible close-race position, D returned four left plus two right with [1,2,4,6], and two in each lane with [2,2,2,6]. That particular policy is exploitable in C, while another policy is exactly optimal in both. Changing assumptions therefore requires re-evaluation; old mixes and grading values cannot simply be copied.

## Giving every opponent every allocation changes decisions

Adding U creates a common-policy compromise above 0.02 in **four of twelve** settings, ranging from about **0.0353 to 0.1497**. Recomputed dual lower bounds agree with independently evaluated achievable regrets to floating-point precision. Feasibility restrictions can matter even when detailed numerical partitions add little beyond coarser private menus.

On the uneven board under the concentrated prior, the exported numerical policy puts all six power left for either own hand. Its security loss in U is **1.20**. A newly optimized common D/C/U policy has maximum loss **0.075**. The loss of that one transferred policy is not the minimum unavoidable difference.

U still assumes at most six additive power. It does not cover a real card producing fifteen power, moving existing power, destroying a body or changing locations. It is a sensitivity baseline within this numerical family.

## Apparent move reversals need care

The returned opponent equilibria produced **484** candidate pairwise ordering reversals larger than 0.02. The preregistered audit examined the eight largest. For each pair it minimized and maximized the EV difference over all epsilon-optimal opponent policies in each game.

**None of those eight remained a reversal across every optimal opponent policy.** All eight came from the same concentrated full-opponent-lane setting; the other candidates were not audited. This exposes equilibrium selection ambiguity. It does not prove that no robust reversal exists.

An action can be optimal against the returned opponent mixture yet belong to an exploitable repeated strategy. Action EV loss, frequency and security regret answer different questions. The saved results retain each separately.

Post-hoc transfers across the two declared priors also found sensitivity: the exported D policy lost up to **0.90** in the other prior, and the C policy up to **0.488**. These describe particular exported equilibria. Common policies across priors were not optimized, so the losses do not prove such compromises are necessary. The priors have no measured real-Snap frequencies.

## Effects that changed decisions

These are restricted synthetic boundary states with declared effect menus. They are not complete legal Snap decks or complete opportunity sets. Their primary rule sources and precise scope are listed in the study README.

| Matched comparison | Observed consequence |
| --- | --- |
| Fifteen power in one lane versus Doctor Doom’s five in each lane, both labeled one played card | Each game permits a guaranteed win, but the winning allocation sets conflict. The best common policy loses 1 EV relative to each model’s optimum. |
| Existing three-power body stationary versus allowed to move once before reveal | Stationary: adding two left is optimal. Movable: mix left/middle equally. Their best common compromise has 0.5 maximum security loss. |
| One ten-power body versus two five-power bodies, without destruction | Both choices win; equal total power suffices in this control. |
| Same bodies with a single-target destroy-ten effect revealing after us | One ten loses, two fives win: individual action EV loss changes from 0 to 2. |
| Same destruction effect revealing before our new bodies | Both choices win again. Priority changes the consequence. |

In the first control our initial totals are [4,4,0], the opponent is empty, and our hand is [1,2,4,6]. A positive right-lane allocation can beat a focused fifteen-power threat; six right fails against five in every lane. Four and two across left/middle beat the spread threat. That allocation can lose to focused power. A mixed private opponent range leaves these choices strategic.

The focused fifteen-power packet is a matched-power counterfactual, not a claim about a named card. The numerical own choices deliberately keep the control small. It establishes a mechanism by example, not how often that mechanism matters in real matches.

An exact label control also verified that one play creating three bodies and three separate plays with the same resulting board share payoffs in this restricted interaction. Play count cannot be dropped when triggers, body size, slots or future resource consumption distinguish outcomes. The destruction control explicitly demonstrates a body distinction that matters.

## Computational cost

The final run used Linux x86_64, four reported CPUs, Python 3.12.15, Node 24.22.1, NumPy 2.3.5 and SciPy 1.17.0. Numerical libraries used one thread. It performed **70 game solves and 199 LP optimizations**, including controls, pooling ablations, shared-policy optimization and interval audits.

- Bounded run: **10.36 seconds**, starting after Python imports and ending before report serialization, log transfer and artifact upload.
- Lifetime Python peak RSS: about **120.5 MiB**; JS verifier: **97.4 MiB**.
- Sum of lifetime peaks: **217.8 MiB**. This is not simultaneous RSS or per-case memory.
- Existing D solve: **13–27 ms**, median **22 ms**.
- Generic Q solve: **23–44 ms**, median **40 ms**.
- Generic C solve: **13–29 ms**, median **25 ms**.

Per-game timings include Python compilation, optimization and verification; external JS verification is additional. These are single-run CI observations, not M2 or browser latency. Q uses a more general effect evaluator than D, so their timing difference is not an isolated representation comparison.

The hand-only ablation held payoff/action sharing constant and toggled private-type pooling. All seven selected opponent types remained distinct in every primary setting. Pooling on/off had the same dimensions and essentially the same cost. **This panel gives no reason to treat numerical hand representation as the major bottleneck.**

A synthetic stress control duplicated labels to 32 own and 112 opponent types. Exact pooling restored 2 and 7. LP optimization took **7.2 ms pooled versus 59.0 ms unpooled**, while total Python time was **157 versus 249 ms**; verification still processed the original aliases. This measures redundant labels, not a realistic broader hand distribution.

The earlier 792-to-103 seven-card-hand reduction remains valuable in that declared empty-board case. It does not imply that coarsening these seven distinct hands yields a similar engineering saving. This pilot provides no full-game RAM or runtime estimate.

## Teaching implications and next investment

The numerical reference can illuminate lane thresholds, wasted power, slots and uncertainty over available allocations. The pilot favors preserving useful feasibility constraints while allowing effects that break the cost/power/shape relationship.

Early commitment and preservation of flexibility require multiple turns, resource consumption, draws and effect transitions. Terminal menus alone cannot teach them. Movement, destruction and priority deserve explicit treatment when a lesson depends on them. Snap/retreat risk requires a cube objective and actual decisions to raise or leave; outcome EV alone cannot teach it.

The small panel does not sample the real metagame, test learners or validate a curriculum. Its fixed own hands, additive budgets and invented priors limit the findings. Stability across these models is a reason to investigate a lesson, not proof of transfer.

The recommended next investment is **six to eight paired turn-six drill concepts**, evaluated using the verified reference and small declared private capability menus. Cover enough power without waste, a single-card multi-lane threat, movement, and destruction/priority. Use own choices and effects a Snap player recognizes. Opponents continue to optimize within hidden menus.

For each concept, preserve distinctions that either change a verified decision for a stated reason or express a meaningful resource, slot or effect constraint. State the range, measure sensitivity and explain genuine tradeoffs. A numerical deck label need not be a prerequisite for representing a threat.

Have a knowledgeable Snap player review the concepts, then use a few learner think-aloud sessions to check what users infer and whether they apply the lesson to unfamiliar real positions. That provides qualitative evidence; a small learner sample would not establish general transfer.

Planning estimate: **half to one and a half engineering days** for a bounded drill specification/evaluation package of comparable terminal menus, plus **one to two hours of domain review** and separate learner sessions. Comparable terminal computations should fit a minutes-scale budget; this is an estimate, not a larger-effects-engine benchmark.

Keep unrestricted numerical deck equilibrium and turns one through four paused. The unrestricted game remains a research objective, but it is not required to establish the value of these lessons. Retain the audited endgame solvers as regression references. Specify earlier-turn capability models after the terminal lessons earn further work.
