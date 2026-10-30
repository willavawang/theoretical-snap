# Offline equilibrium research engine

The current task is to solve the numerical game offline. Site deployment and trainer integration are deliberately outside this implementation.

## The unrestricted game

The default configuration is configs/solver/open-game.json:

- Both players may privately select any of the 6,188 twelve-card cost compositions over costs 1–6.
- Private deck selection and subsequent play are optimized together.
- Every affordable complete turn, placement and pass remains available.
- Six turns, energy equals turn, power equals cost, three neutral lanes and four slots per player per lane.
- Three opening cards plus the turn-one draw give four available cards; subsequent draws are without replacement. Hand limit seven; full hands skip draws.
- Win +1, draw 0, loss −1. EV = P(win) − P(loss).
- No presets constrain the unrestricted run. Small restricted deck universes exist only as independent mathematical control cases.
- No abilities, location effects, cubes, snaps or retreats.

The algorithm is outcome-sampling MCCFR with importance-corrected exploration for both players. On the final turn it enumerates every updater action against a sampled opponent action, reducing variance without pruning choices. Private deck choices are simultaneous and are also trained by regret minimization.

The initial implementation explored only the updating player. Longer tests exposed unstable averaged strategies that drew in self-play but were exploitable. Explicit opponent exploration bounds the behavior probabilities, with matching target/behavior importance factors throughout the episode and deck-choice update. Multi-seed exact controls guard this correction.

## What “progress” means

A running job adds sampled regret updates and accumulates an average strategy. More work does not guarantee that every intermediate strategy improves monotonically.

The reports distinguish:

1. Exhaustive numerical deviation bounds on games small enough to enumerate.
2. Frozen-strategy Monte Carlo win/draw/loss and EV estimates.
3. Learned information-constrained deviation searches. A profitable deviation can demonstrate exploitation; failure to find one cannot certify equilibrium.

An opening Nash bound is also distinct from accurate conditional play at every rare/off-equilibrium information state. The unrestricted game has not been certified solved.

## Run on a laptop

No installation or numerical dependency is required beyond Node 18 or newer. From the repository root:

    node --expose-gc scripts/solver/offline.cjs train --config configs/solver/open-game.json --seconds 1800 --memory-mib 2048 --max-states 2000000 --out artifacts/offline/open-game --background

Inspect progress:

    node scripts/solver/offline.cjs status --out artifacts/offline/open-game

Request a checkpointed stop:

    node scripts/solver/offline.cjs stop --out artifacts/offline/open-game

Continue the compatible checkpoint:

    node --expose-gc scripts/solver/offline.cjs resume --seconds 1800 --memory-mib 2048 --max-states 4000000 --out artifacts/offline/open-game --background

The runner keeps a lock to prevent concurrent writes to the same run directory. After an abnormal machine/process shutdown, confirm that the old process has exited before removing a stale runner.lock. Stop uses a marker file rather than sending signals to a possibly reused process ID.

Time, state, RSS and key-space limits pause training and save the current state. No state is silently removed and no capped run is declared solved. RSS is checked at batch boundaries, so the configured limit is a soft guard rather than an operating-system hard limit. Checkpoint writing and final evaluation can extend elapsed time beyond the training budget.

## Files in a run directory

| File | Purpose |
| --- | --- |
| checkpoint.bin | Resumable regrets, averaged strategies, RNG state and exact identity dictionaries |
| checkpoint.json | Build/model identity, byte count and checkpoint write time |
| status.json | Latest iteration count, state count, memory use and stop status |
| report.json | Trajectory, exact bounds where feasible, profile estimates and exploratory deck weights |
| decision-example.json | Complete Game State Object plus submitted-turn and alternative EV results |
| game-replay.json | Reproducible complete game with seven full state snapshots and six commitment pairs |
| runner.log | Progress output for a detached local run |
| deviations.json | Optional learned deviation-search results |

Checkpoint writes use a temporary file and atomic rename, with a trailing SHA-256 integrity digest. Restore verifies the engine build, game/estimator fingerprint, numeric data and memory budget. Exact continuation is tested. Engine-code changes require an explicitly compatible build; old checkpoints are not silently reinterpreted.

A checkpoint is training storage, not a minimal deployment policy. Its current size does not estimate the final size or time of a fully solved game. Reported visited-state count is not the total number of necessary states.

## Compact implementation

solver/offline/engine.cjs reuses dist/solver/engine.js for rules, chance, state transitions and terminal scoring. It does not modify the browser code.

It avoids materializing all 162,162 opening private types per player. Decks and hands are sampled directly with exact hypergeometric hand probabilities. All 400 possible numerical commitments through energy six share one immutable action catalog.

Full public action histories and remembered private histories retain separate exact IDs. Each player's key excludes the other private history and the pending opposing commitment. Compact integer keys are equality-checked, not probabilistic hashes. Float64 regret/average data and node metadata live in typed-array blocks rather than a persistent object graph per state. Legal action subsets are shared by hand, energy and lane capacity.

The finite key-space and memory budgets are operational limits, not abstractions of the game. Hitting either pauses the job.

## Full state and decision contract

game-state.cjs stores the actual state: both card collections, hands, remaining draw order, lane placements, starting private types, turn history and draws. It derives the player-visible view from those facts and the rules.

Game-model identity is separate from the training-policy identity, so a saved game can be reanalyzed under a newer sampling implementation for the same model. Stable card IDs connect drag/placement inputs to complete action alternatives. Identical copies are interchangeable mathematically while retaining usable UI identities.

    const G = require('./solver/offline/game-state.cjs');
    const D = require('./solver/offline/decision.cjs');
    const gameState = G.makeGameState(solver, {seed: 701});
    const analysis = D.analyzeDecision(
      solver, gameState, 0,
      [{cardId: gameState.players[0].hand[0], lane: 0}]
    );

The supplied placements must be legal. Production callers should validate or let actionForPlacements reject energy, ownership, duplicate-card and lane-capacity errors.

The result contains:

| Field | Meaning |
| --- | --- |
| stateId | Exact immutable state being evaluated |
| modelFingerprint / policyFingerprint / policyIterations | Game and trained-strategy version |
| view | Public board and this player's hand, with opponent counts |
| submitted | Entire submitted placement, frequency, EV and W/D/L |
| yourEV | Expected outcome after the submitted complete turn |
| handEV | Expected outcome when following the current mixed strategy for the hand |
| maximumEV | Largest estimated action EV under those same beliefs and continuation policies |
| evLoss | maximumEV minus yourEV |
| best / alternatives / actions | Complete placements with stable card IDs, frequencies, EVs, loss and uncertainty |
| status / reason | Provisional, unavailable, and the scope of the result |

Analysis leaves the actual Game State Object unchanged. Swapping the actual unobserved opponent hand does not change action values when the querying player's information and model remain identical; this is tested.

The value of each root action includes all remaining turns and draws under the frozen continuation strategy. These are exploratory strategy values until a suitable equilibrium bound exists.

## Historical conditioning

For decision inspection, exact rejection conditioning samples opponent private histories under the frozen averaged strategy. It replays observed public actions, weights their strategy likelihoods and preserves private draw observations. It never substitutes the simulator's true opponent hand.

This is mathematically clean but inefficient for rare histories. If the posterior-sampling budget is insufficient, analysis returns unavailable. It does not present a handful of samples or the actual hidden hand as a solved posterior. Improving arbitrary-position analysis remains a distinct research task.

The simultaneous Hoeffding sampling interval on action EVs excludes error in the reference strategy. A small sampling interval alone therefore does not establish GTO.

## Independent evaluation

evaluate.cjs constructs a separate full tree with the original engine when feasible, imports the offline policy through history translation, and computes information-constrained best responses.

For a small deck-selection universe, it additionally checks every unilateral deck choice and optimal continuation against the unchanged opponent policy. It does not treat each deck pair as a public-deck duel.

For the unrestricted 6,188-deck game, exhaustive bounds currently exceed the evaluator's budget. The report marks the upper bound unavailable.

    node --expose-gc scripts/solver/offline-deviations.cjs --checkpoint artifacts/offline/open-game/checkpoint.bin --seconds 10 --samples 5000

This trains separate information-constrained deviations against the frozen reference and evaluates them with independent seeds. It reports a simultaneous-confidence lower bound on exploitability, never an upper bound or convergence certificate. An exploitable control case tests that the probe can detect a known weakness.

## Repository execution and continuation

The offline-solver GitHub Actions workflow runs the mathematical tests, small six-turn controls, unrestricted training, checkpoint resumption and a deviation probe. Artifacts contain checkpoints and complete example records. They are retained for 90 days.

configs/solver/research-run.json selects the compute budget and a compatible prior run to continue. An empty resumeRunId starts fresh. Manual workflow inputs can override the budget/run ID. The workflow downloads only the prior checkpoint into the new run; it does not reuse another host's process lock.

The first corrected unrestricted run and raw measurements are recorded in benchmarks/offline-first-run.json. Its hardware was a repository Linux runner, not the user's M2. Laptop latency and full-game time-to-accuracy remain unmeasured.

## Completion boundary

The current deliverable is a resumable offline mathematical research engine and an inspectable state/analysis contract. It is not a claim that the full game, deck-selection equilibrium, every rare history, or a production GTO policy has been solved. No front-end integration or publication is part of these changes.
