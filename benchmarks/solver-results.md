# Playing solver — benchmark results

Node process on the executing machine. NOT Safari, phone, browser Worker or WebAssembly measurements.

Three equally weighted private deck presets. Midgame examples use explicitly uniform historical legal-play likelihoods, not equilibrium-history posteriors.

Target: Nash gap and maximum conditional root-type improvement at most 0.01. A missing certificate is not a solved position.

| Position | Algorithm | Runs meeting target | Cold median | Warm median | Gzip checkpoint | States |
|---|---|---:|---:|---:|---:|---:|
| public-final | Bayesian matrix CFR+ | 3/3 | 21.0 ms | 3.3 ms | 1.3 KiB | 2 |
| hidden-final | Bayesian matrix CFR+ | 3/3 | 22.1 ms | 3.7 ms | 1.9 KiB | 4 |
| two-turn-check | Full-tree CFR | 3/3 | 23.7 ms | 1.7 ms | 1.0 KiB | 34 |
| turn-6 | Bayesian matrix CFR+ | 3/3 | 304.4 ms | 40.3 ms | 27.7 KiB | 90 |
| turn-5 | Outcome-sampling MCCFR | 0/3 | 488.9 ms | 155.3 ms | 1161.0 KiB | 25000 |
| turn-3 | Outcome-sampling MCCFR | 0/3 | 581.0 ms | 198.8 ms | 1242.9 KiB | 25000 |
| turn-1 | Outcome-sampling MCCFR | 0/3 | 989.7 ms | 238.0 ms | 1225.5 KiB | 25000 |

Cold time includes range construction, initialization, training and action EV evaluation. Warm time includes JSON parsing, solver reconstruction and the same EV evaluation; it resumes the IDENTICAL public position, rules and belief model. It is not a timing for a new position.

For sampled games, these are bounded computation times, not measured times to equilibrium. Numeric table bytes omit JavaScript object/key overhead; retained heap and array-buffer deltas are approximate Node measurements. Checkpoints retain regrets and average strategies, with shared action metadata.

Device-specific engineering decisions require running the same harness on target browsers. Full-game and rare-history certification remain separate from terminal-game certification.
