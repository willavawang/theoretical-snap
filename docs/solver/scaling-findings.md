# Offline solver: measured scale and remaining engine work

The unrestricted numerical game is substantially too large for a complete, unmerged history table on a laptop. The offline engine can accumulate and resume sampled updates, but increasing the iteration budget alone does not establish usable equilibrium play at arbitrary positions.

## Completed unrestricted repository run

[Research run 40985483413](https://github.com/willavawang/theoretical-snap/actions/runs/40985483413) continued the prior checkpoint with every one of the 6,188 deck choices available to each player. It paused at the 2 GiB RSS guard after about 570 seconds of that continuation. Checkpoints and example states were saved successfully.

After a five-second recovery check, the checkpoint contained 178,241 training iterations, 3,598,103 information states and 35,915,395 action entries. Its uncompressed training file was 715.8 MiB. This file includes training accumulators and identity dictionaries; it is not a minimal deployment policy.

The small complete six-turn validation game met its exhaustive numerical target. The unrestricted game has no exploitability upper bound or equilibrium certificate. Its short learned-deviation searches did not find a statistically significant profitable attack, which supplies no certificate of safety.

## A reproducible lower bound on table size

`solver/offline/census.cjs` counts single-player public commitment histories with a small integer dynamic program. It tracks lane occupancy and public hand counts, includes every legal affordable composition/placement, passing, the hand limit and skipped draws. Arbitrary legal decks allow a compatible deal for each accepted history: assign required cards in order of first play and fill unused draw slots. Since private deals and draws are independent between players, the two players' public-history counts multiply.

| Start of turn | Own public commitment prefixes | Joint public commitment prefixes |
| --- | ---: | ---: |
| 1 | 1 | 1 |
| 2 | 4 | 16 |
| 3 | 52 | 2,704 |
| 4 | 1,784 | 3,182,656 |
| 5 | 100,444 | 10,088,997,136 |
| 6 | 6,192,523 | 38,347,341,105,529 |

At turn six, each public prefix requires at least one distinct remembered information state for each player. That gives **at least 76,694,682,211,058 turn-six information states** before counting additional distinctions between private hands, decks and draws. Each has passing and at least one affordable placement: at most eight cards have been played, the deck has not exhausted its twelve cards, and the final draw leaves a card in hand and a lane slot available.

Separate double-precision regret and average entries for just those two actions require at least **2,454,229,830,753,856 bytes: 2.45 PB**. Keys, additional actions and hidden-state distinctions add storage. This is a bound for the present unmerged perfect-recall table, not a lower bound on all possible compressed strategies or algorithms. Exact symmetry, proven equivalences, dominance and structured representations may avoid materializing much of it.

The census is independent of training and uses exact integer counts. Tests compare early-turn counts with a separate recursive action enumerator. It does not imply that every history has appreciable probability under an equilibrium.

## Actual M2 measurements

The local machine is an Apple M2 with eight cores and 16 GiB RAM, running Node v18.15.0. The solver currently uses one training thread. A fresh unrestricted 60-second run completed 19,103 iterations and visited 429,694 information states; its old-format checkpoint was 82.7 MiB. These are Node measurements, not browser or Safari measurements, and no convergence target was met.

A separate isolated-process comparison used 10,000 identical iterations for each storage representation:

| Representation | Information states | Retained heap + array buffers | Checkpoint |
| --- | ---: | ---: | ---: |
| Original private-history strings | 228,135 | 94.9 MiB | 44.7 MiB |
| Exact integer private histories | 228,135 | 83.1 MiB | 38.9 MiB |

Packing saved **12.4% retained memory and 13.0% checkpoint bytes** in that workload. Both runs had the same digest of all learned node/deck parameters, update counts and random state. Runtime was 31.3 versus 32.3 seconds; this single comparison does not establish a speed improvement.

The code preserves all 162,162 opening private types and all 19,608 ordered draw histories of length zero through five, including skipped draws. Their product fits in 32 bits. Unsupported custom observation histories remain literal strings. Exhaustive component round-trip tests and training/migration parity tests check that this is a storage change rather than a game abstraction.

## Coverage and submitted-move analysis

The 60-second M2 policy was then evaluated in 2,000 independently sampled games from its frozen deck mixture. About 52–53% of nontrivial opening decisions had a stored training update. That fell to about 10% on turn two, below 1% on turn three, and zero observed trained nontrivial decisions on turns five and six. A separate uniform-deck sample had lower opening coverage. Zero observed coverage is a sample result; it is not proof that no late state was trained.

This is why reporting only the total visited-state count is insufficient. Unvisited states have a defined uniform policy, but that fallback is not learned equilibrium play.

Frozen-policy move evaluation on three workloads took about 28 ms at turn one (four legal actions), 43 ms at turn three (seven actions), and 1.73 seconds at turn six (34 actions) with public rejection envelopes. Workloads selected the largest action count among eight deterministic replayed games at each turn; they are examples, not a latency distribution or fresh-equilibrium timings.

For the turn-six example, the previous rejection method accepted only three posterior samples in 100,000 attempts and returned unavailable. The public-envelope method accepted 256 in 92,395 attempts and returned provisional action values. Its simultaneous sampling error bound was about **0.24 outcome EV**, and reference-strategy error remains unbounded. These values are not yet suitable for precise GTO mistake grading. The envelope method is also tested against an independently known 7/11 private-type posterior, including a trained policy that exceeds the uniform bound.

All results retain complete turn placements, the submitted physical card IDs, mixed frequencies, EV/loss, alternatives, the immutable state identity and a persistent policy-run/version identity. No interface integration was made.

## Consequences for the engine roadmap

1. **Keep the tabular engine as a mathematical control and benchmark.** The next bounded run migrates and continues the existing checkpoint to measure the storage gain at millions of states; it does not expand the current 2 GiB/4-million-state limits or claim a path to full enumeration.
2. **Develop a structured strategy representation.** Prove and test exact symmetries/equivalences first. Any further function approximation must be labeled and evaluated as an approximation; all legal decks and actions must remain available to deviation tests.
3. **Strengthen arbitrary-position analysis separately.** Reuse posterior calculations, improve rare-history proposals and apply independently validated conditional endgame solvers. A fresh solve from an imported state needs a declared belief model and suitable safety/accuracy guarantees.
4. **Measure strategic error, not only self-play and coverage.** Stronger information-constrained deviation searches can reveal errors. A genuine unrestricted upper bound still needs a scalable exhaustive oracle or another mathematically valid certificate. Conditional/off-path accuracy needs separate checks.
5. **Choose browser, precomputed or hybrid delivery after those measurements.** The Game State Object/result contract can support all three. Millisecond evaluation against an untrained continuation is not evidence that an arbitrary-position equilibrium solve is fast.

Raw reports and provenance are in `benchmarks/offline-second-run.json`. The current milestone is a measured research engine with faithful state/analysis output; the unrestricted game remains unsolved.
