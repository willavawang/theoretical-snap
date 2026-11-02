# Coupled final-two-turn evidence

- `results.json`: nine conditional games, independent sequence-form LP results, CFR at cumulative 0.2/1/10-second requested budgets, cold/warm timing, process memory and independently checked deviations.
- `reference-profile.json`: complete reusable model/policy for `asymmetric-draws`, with fingerprints and recomputed bounds.
- `decision-example.json`: turn-five Game State Object and complete original-turn EV output from that profile.
- `turn6-state.json`: the same numerical game after both turn-five commitments and private draws.
- `turn6-decision-example.json`: turn-six query using the saved profile, including its separate local conditional-game certificate. No new optimization is performed when loading the profile.

Install `requirements-turn6.txt` and run:

```sh
python3 scripts/solver/turn56-benchmark.py
node scripts/solver/turn56-solve.cjs --case asymmetric-draws \
  --profile-out benchmarks/turn56/reference-profile.json --out benchmarks/turn56/decision-example.json
node scripts/solver/turn56-solve.cjs --profile benchmarks/turn56/reference-profile.json \
  --game-state benchmarks/turn56/turn6-state.json --out benchmarks/turn56/turn6-decision-example.json
```

Use `SNAP_PYTHON=/path/to/venv/bin/python` for Node commands when the dependencies are in a virtual environment. To regenerate a turn-six state, load the profile with `solver/two-turn/profile.cjs`, make a root Game State Object through `solver/offline/game-state.cjs`, select complete legal commitments from the root policy and call `commitTurn`. The recorded seed is 711; both recorded actual private root types are index zero. The state is illustrative hidden truth for replay, not an input substitution for the public prior.

The final local timing run followed the test suite rather than competing with it. It records an actual Apple M2 Mac host, not browser/Safari timing. Warm LP runs repeat optimization and verification on a compiled tree; they do not retrieve a cached equilibrium. Memory fields retain their scope and units. Historical belief construction is not included.

See [findings](../../docs/solver/turn56-findings.md), [mathematics](../../docs/solver/turn56-mathematics.md) and [API/limits](../../solver/two-turn/README.md). The examples do not establish a universal earlier-turn latency or a full-game/deck-selection equilibrium.
