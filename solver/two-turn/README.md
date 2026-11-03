# Coupled turns-five/six solver

This backend implements the next stage recommended by the audited turn-six findings. It optimizes both remaining turns together, with hidden hands, simultaneous commitments, private draws, passing and underspending. The existing Game State Object remains the external replay/state format.

The independent reference uses sequence-form LPs; the candidate uses a public tree and private-range CFR+. These are conditional games under supplied priors, not an unrestricted opening/deck-selection equilibrium. No deck candidates or legal actions are removed to meet a budget.

## Run

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-turn6.txt
SNAP_PYTHON=.venv/bin/python npm run test:two-turn
.venv/bin/python scripts/solver/turn56-benchmark.py
SNAP_PYTHON=.venv/bin/python node scripts/solver/turn56-solve.cjs \
  --case asymmetric-draws --profile-out artifacts/profile.json --out artifacts/turn5.json
```

Use `--model FILE` instead of `--case` for a custom turn-five model. Inputs use the existing `board[player][lane]` card arrays and either independent `ranges[player]` or weighted correlated `cases`. Each private type has `hand`, `remaining`, optional remembered `observations` and a weight. Standard defaults are twelve cards, seven-card hand limit and six turns. Both players' public ranges are required; the actual stored opponent hand is not a replacement.

`--method lp` is the default. `--method cfr --seconds 10` returns the CFR averaged policy and independent bounds, retaining provisional status if the target is missed. Every CLI solve cross-checks its policy against the independent Python sequence-form calculation.

## Save a strategy and inspect subsequent decisions

`--profile-out FILE` stores the complete model and behavioral policy, model/policy fingerprints, and measured bounds. It is a strategy export, not a training checkpoint with regrets. The same public-root profile can serve different actual hands and both remaining turns.

```sh
SNAP_PYTHON=.venv/bin/python node scripts/solver/turn56-solve.cjs \
  --profile artifacts/profile.json --game-state my-turn6-state.json \
  --placements my-plan.json --player 0 --out artifacts/turn6.json
```

Loading a profile performs no new optimization. The CLI still reconstructs and independently verifies the finite game; that verification cost is not a cache-lookup latency. An in-process client can retain the compiled game and policy:

```js
const {restore}=require('./solver/two-turn/profile.cjs');
const {query}=require('./solver/two-turn/query.cjs');
const G=require('./solver/offline/game-state.cjs');
const {game,policies}=restore(savedProfile);
const decision=query(game,policies,{gameState,player:0,placements});
const nextState=G.commitTurn(gameState,[yourPlan,opponentPlan]);
const nextDecision=query(game,policies,{gameState:nextState,player:0,placements:[]});
```

The Game State Object stores truth for replay. `query` validates it but uses the supplied profile and own information for EVs. It preserves physical card IDs and never mutates the state. `handEV`, `maximumEV`, submitted EV/loss and every original card turn remain available. Turn-five action EV holds the returned future policy fixed; the separate `bestResponseEV` additionally optimizes future own play.

Turn-six decisions also get a terminal conditional-game check after Bayesian conditioning on the actual public commitments. A small whole-game error alone does not validate every rare child. Unsupported opponent commitments return unavailable; a counterfactual own observation with zero profile reach remains provisional. No posterior is fabricated from stored opponent truth.

## Modules and limits

- `model.cjs`: coupled public branches, private draw/resource states, terminal power sharing and reverse action maps. Intermediate compositions and private histories remain distinct.
- `cfr.cjs`: alternating CFR+ with linear averaging of realization plans; later behavior averages are weighted by own preceding action reach.
- `verify.cjs`: exhaustive full-continuation best responses and root action values for the candidate representation.
- `continuation.cjs`: exact strategy-dependent posterior and matching final-turn policies; zero-reach handling.
- `profile.cjs`: strategy persistence, identity checks and recalculated bounds.
- `query.cjs`: Game State Object validation and decision output for either turn.
- `scripts/solver/turn56_reference.py`: independent physical-card enumeration, sequence-form flow constraints, two LPs and independent best-response calculations.

Default candidate construction limits: 4,096 public branches, 100,000 information sets, 1,000,000 strategy entries and 5,000,000 shared payoff cells. `compile(model, limits)` can change them. The independent small-game reference separately limits 256 root worlds, 200,000 sequences per player and 2,000,000 nonzero payoff entries. A construction stop rejects the request explicitly; it does not solve a restricted action game and label it complete.

See [findings](../../docs/solver/turn56-findings.md), [mathematics](../../docs/solver/turn56-mathematics.md) and [reproducible evidence](../../benchmarks/turn56/README.md). No trainer integration is included.
