# Proposed results contract

Status: design and mathematical review, 2026-10-27. This contract is not yet
connected to the live trainer's illustrative review fixtures.

## Unit of evaluation

Evaluate a complete legal turn plan from the player's information set. A plan
includes affordable cards, their lane assignments, passing, and relevant order
when abilities are introduced. A card-by-card greedy recommendation is not a
substitute for comparing complete turns.

## Revealed board versus unresolved turn

Lane leadership and its glow describe only cards already revealed. A queued
or submitted action cannot establish a lane win before the opponent's turn is
revealed. Show the revealed total as the primary figure and an explicitly
projected secondary total for unresolved cards. Alternative previews follow
the same rule. The current prototype does not resolve an opponent action, so
submission alone must not convert its planned cards into revealed board state.

## Values

For the fixed-stakes baseline, use terminal score win = 1, draw = 0.5, loss = 0.

For information I, complete action a, hidden state h, opponent action b, and
the specified continuation policies:

`Q(I,a) = sum_h belief(h|I) sum_b opponent_policy(b|h,I) E[terminal_score|I,h,a,b]`.

Compare actions under the same beliefs, opponent policy, and continuation.
Per-decision loss is `max_a Q(I,a) - Q(I,chosen)`, with numerical uncertainty.
Present this in percentage points of expected match score. It is a difference
in win probability only when the draw probabilities make that identity valid.

An action's frequency in a solved mixed strategy is a separate output. A single
choice cannot establish whether a user mixes at the correct frequencies. Equal
value against a fixed opponent strategy does not make an arbitrary repeated
policy unexploitable. Solutions can be nonunique.

## Visible hierarchy

1. **Verdict:** good, equivalent, costly, or not reliably distinguishable.
2. **Magnitude:** the expected value lost relative to the best available turn.
3. **Reason:** a board fact, the opponent response that matters, and the
   counterfactual alternative. Reveal one consequential response at a time.
4. **Comparison:** ghost placement, original and alternative totals, and a
   link between the relevant lanes, while preserving the top-down board.
5. **Details on demand:** W/D/L, mixture, beliefs, solver gap, and model scope.

Keep the sampled showdown separate from the evaluation. A displayed opponent
response is an explanatory example, not advance knowledge of their actual move.
Lane probabilities are correlated; do not multiply or add their marginals as a
replacement for joint match outcomes.

## Current model mismatch

The v0.5 research archive contains a no-card allocation dynamic program and a
restricted final-turn cube calculation. Its turn-six placement game permits all
28 ways to distribute six integer power points. The current website instead
has a hand, indivisible cards, energy constraints, and occupied slots. Its legal
actions and information sets differ. Do not apply the allocation values as
grades for arbitrary card positions.

The v0.5 cube module is a one-sided final-turn offer calculation, with no
counter-snap and no earlier cube-aware strategy. Its scalar value is W-L,
not win probability. The archive's script also needs portable imports/paths to
run outside its original /mnt/data layout.

## Independently checked worked example

Turn six, public known hands [1,2,4,6] for both players, six energy each.
Public board totals: player [1,5,9], opponent [6,4,5]. Player slots used
[1,2,2], opponent [2,1,2]. Cards have power equal to cost; no abilities,
special locations, future turns, snaps, or retreats. This is a public-hand
benchmark, not a hidden-hand whole-game equilibrium.

All legal card plans, including underspending and passing, compress into 37
payoff-distinct allocations on each side. Identical final totals can be grouped
because this is the terminal turn; canonical card representatives are not
intrinsically special strategic frequencies.

An independent matrix solve and exact rational deviation check certify value
W-L = 1/5, equivalently expected match score 3/5. One equilibrium is:

- Player: [6,0,0] with 2/5; [0,6,0] with 1/5; [0,4,2] with 2/5.
- Opponent: [0,0,6] with 2/5; [0,6,0] with 1/5; [2,4,0] with 1/5;
  [4,2,0] with 1/5.

Against that opponent mixture, putting six in Right gives W/D/L = 40/0/60 and
score 0.40. Six in Left gives 60/0/40 and score 0.60: a loss of 20 percentage
points for Right. When the opponent sends six to Middle (20% of this mixture),
Right wins only Right, while Left wins Left and Right. That branch accounts
for the full score difference under the specified mixture.

Four in Middle plus two in Right instead has W/D/L = 40/40/20 and the same
0.60 score. This is why grading only win probability would be incorrect.

Exactness here applies to this enumerated public-hand matrix and rational
certificate. It does not certify the old full dynamic program, a hidden-hand
belief model, or the current trainer's complete set of positions.
