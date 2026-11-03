# Preregistered bounded capability-sensitivity pilot

Decision: test which distinctions deserve a place in the trainer before broader solver work. No turns-one/four expansion, unrestricted deck selection, frontend integration or learner-transfer claim is authorized by this study.

Primary panel, fixed before examining solutions:
- Six listed boards and two listed independent priors, from fixtures.cjs.
- Our private range is unchanged across all arms: hands [1,2,4,6] and [2,2,2,6], equal mass. Both hands are reported.
- D is the existing numerical-hand oracle. Q is an exact terminal payoff/menu quotient.
- C pools opponent menus by maximum added power, maximum affected lanes and lane access, granting the union menu to each pool. This is a deliberate game change, not an exact abstraction.
- U grants every integer allocation up to six into nonfull lanes. It is a relaxation within an additive six-power game, not a realistic or worst-case real-Snap forecast.
- All opponent choices are optimized; priors weight private feasible menus, never prescribed moves.
- Every source opponent type can spend six. This holds total maximum power constant while varying shape/flexibility.
- Terminal card-count metadata does not constrain a menu. Only declared effects and capacity do. Separate matched-effect controls distinguish representation from changed feasibility.

Outcome checks:
- All equilibrium results need global and conditional private-type gains <= 1e-6.
- Compare action loss and transferred policy security loss within each target game.
- Q must preserve value and the EV vector for the same lifted/frozen policy. Different independently selected equilibria are not required to have the same off-support values.
- Use 0.02 outcome EV as a materiality/reporting convention, not a validated learning threshold.
- Calculate minimax regret across D/C and D/C/U to ask whether a common strategy can remain near-optimal. Independently evaluate each reported regret against target best responses.
- Check up to eight largest candidate pairwise reversals with min/max EV-difference LPs over epsilon-optimal opponent policies (at most 32 auxiliary optimizations).
- Up to 24 minimax-regret optimizations. These and the interval checks remain below the proposed 60 auxiliary-solve budget.
- Preserve all action losses and report unexamined equilibrium ambiguity as unresolved.

Documented-effect control panel:
- Match fifteen total power: concentrated synthetic packet versus the documented Doctor Doom spread effect; both have one played-card label. Concentrated fifteen is a matched-power counterfactual, not a claim about a named card.
- Movement absent/available for an existing three-power body.
- Matched ten power as one body versus two five-power bodies, without/with a single-target destroy effect, under both priority orders. Initial board is tied so either normal priority outcome is possible.
- These are restricted effect tests, not a complete Snap rules simulator or evidence of human learning.

Resources:
- One sequential CI process, numerical libraries one thread.
- Primary 48 solves plus bounded control/ablation/robustness checks.
- Experiment wall budget 15 minutes, outer CI timeout 20 minutes, 2 GiB process high-water reporting limit, 10-second LP budget. Stop without pruning or certification if a limit is exceeded.
- Reuse the independently validated terminal LP constructor. Independently reconstruct payoffs and verify original-menu deviations in JavaScript.
- All new timing is labeled by actual CI host; it is not M2 or browser latency.
