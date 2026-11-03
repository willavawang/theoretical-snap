# Capability sensitivity, before expanding the solver

This isolated study asks which modeled distinctions change allocation decisions.
It neither changes the trainer provider nor expands the full numerical game.
See [preregistered design](spec.md), [fixtures](fixtures.cjs), and
[findings](../../docs/solver/capability-findings.md).

## Reproduce

At the saved source commit, with Node 24 and Python 3.12:

    python -m pip install -r requirements-turn6.txt
    node --test studies/capabilities/test.cjs
    python -m unittest discover -s studies/capabilities -p test_reference.py -v
    OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 python studies/capabilities/run.py --out studies/capabilities/results

The bounded CI workflow also runs the existing 84 regression tests. It has
read-only repository permissions. The study writes a JSON report containing
fixtures, both private-range policies, all original own-action EVs, numerical
best-response bounds, comparisons, and host-specific resource measurements.
The report's source commit and content hashes identify its inputs.

## What is held fixed

Six reachable numerical boards, two independent opponent menu priors, and an
unchanged equal-weight own range of [1,2,4,6] and [2,2,2,6]. Each opponent
numerical hand can spend six. Every arm permits passing and underspending.
The priors weight private sets of available choices. They are never
probabilities of prescribed opponent moves.

| Arm | Meaning | Same game as D? |
| --- | --- | --- |
| D | Existing individual-card Python numerical oracle | Yes |
| Q | Share complete equal payoff rows/columns and equal private menus | Yes |
| C | Group by maximum power, maximum affected lanes, and lane access; grant union menu | No |
| U | Any integer allocation of at most six into nonfull lanes | No |

C deliberately grants additional choices. U is an additive allocation
relaxation, not a realistic range for actual Marvel Snap. Neither handles
arbitrary real abilities. Q's equivalences apply to this terminal game and its
complete declared opposing action set; a different range/effect game must be
compiled again. Earlier-turn resource and transition equivalence is not tested.

## Independent checks

The existing numerical oracle enumerates individual cards. A study-only
Python evaluator separately rebuilds bodies, effects, and terminal outcomes,
then reuses the audited Bayesian LP constructor. The JavaScript evaluator
rebuilds outcomes from the original unmerged menus and checks every legal
information-constrained deviation. The JS payoff matrix is not passed to Python.

Global Nash gap and maximum conditional private-type gain must both be at most
1e-6 outcome EV. This is floating-point numerical verification, not an exact
rational proof. No claim follows about equilibrium opening beliefs,
full-game re-solving, unrestricted equilibrium decks, or real learners.

For D/Q, a frozen realized profile must give the same original-action EVs;
separately optimized equilibria need only have the same game value. Nonunique
equilibria can legitimately give different off-support action values.

## Decision comparisons

Within each target game, evaluate an imported policy against the opponent's
best response. Average over our hidden hand before the opponent selects its
response: an opponent never gets to see our private type. Security loss is the
target game's optimal guaranteed value minus that policy's guaranteed value.

The shared-policy LP minimizes maximum security regret across D/C and D/C/U.
This asks whether one strategy can be near-optimal across models even if
individual solver mixtures look different. Raw EVs across different games do
not measure educational quality.

A bounded ranking audit computes minimum and maximum EV(a)-EV(b) over all
epsilon-optimal opponent policies, using optimal-face LP constraints. The
largest eight point reversals are eligible; all others remain unexamined.
Intervals can expose ambiguity rather than certify a reversal.
The 0.02 threshold is a reporting convention, not a validated teaching cutoff.

## Effect controls

Small additional synthetic states test:
- A matched fifteen-power concentrated threat versus Doctor Doom's one-card
  three-lane effect, and uncertainty over these private menus.
- A three-power body staying versus moving once before reveals.
- Ten total power as one body versus two five-power bodies, with/without a
  single-target threshold destroy effect, in both reveal orders.

Equal-result one-play and three-play labels also have an exact invariance
control. That does not imply real card count never matters. Body size,
capacity, play-trigger effects, and earlier resource consumption can matter.

These controls document only their listed effects. They are not full legal
Snap decks, full opportunity sets, a metagame sample, or a general effects
engine. Multiple eligible destruction targets are rejected rather than
inventing an unsupported choice rule.

Primary sources for the illustrated rules:
- [Doctor Doom: five-power DoomBots restored](https://marvelsnap.com/august-31st-balance-updates/).
- [Moveable keyword](https://marvelsnap.com/patch-notes-may-19th-2026/);
  [Nightcrawler power update](https://marvelsnap.com/balance-update-february-12-2026/);
  [staged moves resolve before card reveals](https://marvelsnap.com/patch-notes-june-04-2024/).
- [Shang-Chi single-target threshold effect](https://marvelsnap.com/balance-updates-september-25-2025/).
- [Reveal priority](https://marvelsnap.helpshift.com/hc/en/3-marvel-snap/faq/38-whose-cards-are-revealed-first-during-a-turn/).

The focused fifteen-power counterfactual is not a claim about any named card.
Current card statistics are not used to claim metagame frequency or learning
transfer. The report explicitly identifies the restricted modeled effects.

## Cost interpretation

Private-type pooling is toggled while holding payoff and outcome sharing
constant. A separate duplicate-label stress control shows the cost of
redundant labels; it is not a realistic larger hand distribution.

All timings are host-specific, single-run observations in one process. Pooled
runs precede unpooled runs, so the timings are not randomized benchmarks.
Memory is a lifetime high-water mark for Python plus the JS verifier. It is
not per-hand memory, simultaneous RSS, M2 latency, browser latency, or a
whole-game estimate. The small fixture panel cannot establish the dominant
bottleneck of a full numerical solve.
