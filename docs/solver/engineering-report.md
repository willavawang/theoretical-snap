# Playing solver: first engineering findings

The first implementation supports the complete numerical rules and all legal choices on both sides. Tested final-turn games and small sequential validation games meet the requested numerical equilibrium bounds. Broad earlier-turn runs currently reach their state budget before an equilibrium certificate is available.

The evidence favors on-demand terminal solving plus exact-position caching. It does not support promising a fast cold solve from every early position.

## Repository benchmark

[Actual run](https://github.com/willavawang/theoretical-snap/actions/runs/40963718830), 2026-10-29. [Full data](../../benchmarks/solver-results.ci.json). Engine SHA-256: `a71391d4c44895bee28d4f0bce1dd6af897a9ec113ef992e8906e1609170458a`.

Node v22.23.4, linux/x64, AMD EPYC 7763 64-Core Processor, 4 vCPUs and approximately 15.6 GiB RAM. These are **not browser, Safari or phone measurements**.

Three repetitions per case, 1.5-second training budget, 10,000-iteration limit and 25,000 information-state cap. Target: Nash gap and maximum conditional root-type improvement both at most 0.01 outcome EV. Cold includes range construction, initialization, training and action evaluation; serialization is separate. Warm restores the identical public root and beliefs and evaluates the same query without more training.

| Position | Cold median | Warm median | Runs meeting both targets | Gzip checkpoint |
| --- | ---: | ---: | ---: | ---: |
| public-final | 63 ms | 9 ms | 3/3 | 1.3 KiB |
| hidden-final | 48 ms | 6 ms | 3/3 | 1.9 KiB |
| two-turn-check | 65 ms | 5 ms | 3/3 | 1.0 KiB |
| turn-6 | 423 ms | 74 ms | 3/3 | 26.5 KiB |
| turn-5 | 717 ms | 210 ms | 0/3 | 1115.1 KiB |
| turn-3 | 637 ms | 261 ms | 0/3 | 1202.1 KiB |
| turn-1 | 957 ms | 285 ms | 0/3 | 1187.8 KiB |

Broad examples use equal private priors over the three existing deck presets for both players. Midgame history is one cost-equals-turn card each preceding turn with rotating lanes, conditioned on explicitly uniform historical legal play. These are fixed probes rather than an average or worst-case sample of every position.

The broader turn-six game has 45 possible private hand/deck types per player. Its worst measured Nash gap was 0.000585 and worst conditional root-type gain 0.003009.

Every turn-one, turn-three and turn-five run stopped at 25,000 states. Their times are durations to return provisional estimates; **time to equilibrium accuracy is unknown**. Cached provisional policies remain provisional.

## Local Apple M2 measurement

A second run used the recovered local Mac: Apple M2, eight CPU cores, 16 GiB RAM, Node v18.15.0 on darwin/arm64. Same engine source hash and same three-repeat harness. [Full local data](../../benchmarks/solver-results.json).

| Position | Cold median | Warm median | Runs meeting both targets |
| --- | ---: | ---: | ---: |
| public-final | 21 ms | 3 ms | 3/3 |
| hidden-final | 22 ms | 4 ms | 3/3 |
| two-turn-check | 24 ms | 2 ms | 3/3 |
| turn-6 | 304 ms | 40 ms | 3/3 |
| turn-5 | 489 ms | 155 ms | 0/3 |
| turn-3 | 581 ms | 199 ms | 0/3 |
| turn-1 | 990 ms | 238 ms | 0/3 |

The broad final turn is about 0.30 seconds cold and 0.04 seconds restored on this machine. The early-game memory-cap finding is unchanged. This is native Node performance on the Mac, **not Safari performance**. Different hardware and Node versions make this a portability check rather than a controlled CPU comparison.

## Memory and reuse

| Position | States | Approximate retained heap + array buffers |
| --- | ---: | ---: |
| turn-6 | 90 | 2.4 MiB |
| turn-5 | 25000 | 46.5 MiB |
| turn-3 | 25000 | 100.6 MiB |
| turn-1 | 25000 | 177.6 MiB |

These are garbage-collected Node deltas rather than peak browser memory. They omit some runtime and transient costs. Numeric strategy/regret bytes alone understate JavaScript object, action and history-key overhead.

Lossless final-turn payoff sharing reduces stored action-pair cells from 2,350,089 to 59,049, about 40 times fewer, retaining each private strategy and every legal composition.

The broad final-turn checkpoint is 26.5 KiB gzip. One hundred equally sized checkpoints would be 2.6 MiB; one thousand 25.9 MiB. That illustration is not a global storage forecast. Early provisional checkpoints are roughly 1.1–1.2 MiB compressed, with much larger live policies. Download compression does not solve training memory or establish accuracy.

## Decisions supported by the measurements

1. **Solve final turns on demand initially.** Tested terminal games meet the target below one second on this Node runner. Set a client latency promise only after target-browser runs.
2. **Cache public positions together with belief models.** Reuse one root policy across actual private-hand queries. The implemented browser cache retains six recent checkpoints.
3. **Keep the small certified teaching fixture bundled.** There is no measured reason yet to ship a large terminal library. Add selected packs if actual device latency or repeated usage warrants it.
4. **Engineer early play separately.** Offline training of a compressed full-game reference policy, with online terminal solving or safe constrained refinement, is the next plausible experiment. Neither an offline blueprint nor safe re-solving is implemented yet.
5. **Require measured error bounds for confident grading.** Extra iterations, strategy stability and cache hits do not establish equilibrium.

This supports a mixed approach: a shared rules engine, small bundled reference games, on-demand terminal analysis, exact-position local reuse and eventually an offline full-game policy with carefully constrained online refinement.

## What is built and verified

The separate `/solver.html` workbench accepts edited public ranges and private queries, shows action frequencies, EV/WDL/loss and diagnostics, and runs a cancellable browser Worker. The engine resumes checkpoints and can condition public history on an averaged full-game reference policy. The trainer's accepted board and exact fixture provider remain intact.

Twenty-seven Node tests pass locally: rational fixture bounds, information privacy, fair versus peeking best responses, optimized versus general joint beliefs, sequential CFR, sampled hidden future draws checked against an enumerated game, no-replacement/skipped draws, exact resumption, invalid inputs, Worker errors and cancellation, plus existing trainer invariants. Browser layout, IndexedDB operation and physical-device runtime remain unverified.

## Outstanding measurements

| Question | Current answer | Next evidence |
| --- | --- | --- |
| How long for each position? | Terminal examples meet numerical bounds; broad early times-to-accuracy unknown | Varied boards, priors and target-device runs |
| How much presolved content? | Small certified fixture initially | Device latency and frequently repeated positions |
| Can early positions solve cold in the browser? | Baseline hits its memory cap | Compact tables, variance reduction and convergence evaluation |
| Can a blueprint help? | Plausible, not implemented or measured | Train/compress a full-game policy and measure exploitability |
| Is a solved continuation globally safe? | Not automatically | Opponent-value constraints and safe re-solving validation |
| Are decks already equilibrated? | No; playing distributions are configurable | Outer deck-selection equilibrium after dependable playing solves |

Rules, public board, prior ranges and historical likelihood assumptions all change the analyzed game and must be part of any cache identity. The opponent's actual hidden deck must never be used to simplify a solve.

The current evidence does not decide between a pure browser product and a future compute service. Browser latency, tolerable waiting time, compression and attainable full-game accuracy still require measurements.
