# Coupled endgame mathematics and audit

The implemented game starts at turn five under a declared joint prior over private root states. It contains both simultaneous commitments, their public reveal, both private draw outcomes, and the final simultaneous commitments. Cards have cost equal to power; unspent energy expires. Passing, all affordable subsets and all legal placements remain available.

## Information and perfect recall

A turn-five decision key contains the player and that player's complete private root type, including any supplied remembered observation label. It does not contain the opponent hand, opponent commitment or future draw.

A turn-six key additionally contains the public pair of turn-five card commitments and that player's own draw observation. Zero is a skipped draw, with the card left in the remaining deck. Different private root histories remain separate even when their current resources match. Different intermediate card compositions are never merged merely because they add the same power.

These keys preserve the player's own previous decision and all modeled observations. Consequently every information set has one preceding own action sequence. Python independently creates the same information partition while enumerating physical-card actions. Hidden worlds that a player cannot distinguish share a policy variable.

The complete Game State Object retains actual cards and stable IDs. It is a replay/validation object, not the optimizer's information set. The input prior is a separate boundary condition. Prior public history can affect that prior and is retained when supplied; it is not reconstructed from board power alone.

## Sequence-form reference

For each player, let the empty sequence have realization probability one. Each private root information set has one variable for each legal turn-five action. At each turn-six information set h, every final action extends its preceding own turn-five action a. The flow equations are

\[
x_{\emptyset}=1,\qquad
\sum_a x_{t,a}=x_{\emptyset},\qquad
\sum_z x_{h,z}=x_{t,a}.
\]

Private-type and draw probabilities belong in the payoff coefficients, not these own-action flows. With both players' flows written as Ex=e and Fy=f, their nonnegative realization vectors x,y produce payoff xᵀAy. A sums each terminal utility multiplied by its joint root-type and draw probabilities. Utilities are independently reconstructed from the raw board and both turns' card allocations.

Player zero solves

\[
\max_{x,v} f^T v
\quad\text{subject to}\quad
Ex=e,\quad x\ge0,\quad F^Tv\le A^Tx.
\]

The free vector v is the dual of the opponent's best-response minimization over y. The other player's LP uses −Aᵀ with the roles reversed. This jointly optimizes the parent and every continuation, rather than giving each child one immutable scalar value.

Behavior is recovered by dividing a sequence's probability by its parent reach. At zero parent reach the reference uses a uniform legal policy; this is a valid whole-game extension but not a claim of sequential optimality in an unsupported history. On imported profiles, the flows and policy normalization are checked again.

This is the standard sequence-form approach, adapted to this game's information sets. Primary foundations are [von Stengel, Efficient Computation of Behavior Strategies (1996)](https://doi.org/10.1006/game.1996.0050) and [Koller, Megiddo and von Stengel, Efficient Computation of Equilibria for Extensive Two-Person Games (1996)](https://ai.stanford.edu/~koller/Papers/Koller%2Bal%3AGEB96.pdf). Linear size in the explicit tree does not make a very large tree small.

## Public-tree CFR candidate

The candidate stores one public node for each feasible pair of turn-five commitments. It propagates each compatible private root type and each legal draw outcome through that node. At the terminal turn, actions adding the same lane-power vector can share payoff calculations and a probability class. Original card turns remain recoverable by uniformly splitting the class probability over legal members. No terminal type bucket is applied to turn five.

For independent priors, opponent terminal powers can be aggregated using the opponent's prior mass, turn-five policy likelihood, private draw chance and turn-six policy. For correlated priors, aggregation is conditional on the evaluated player's private root type. The integer terminal payoff tables are reused across iterations; no standalone LP is launched inside CFR traversal.

Counterfactual terminal values exclude the evaluated player's own preceding action probability. Their prior/chance factors are constant within that information set. Turn-five action values then sum the expected returned terminal policies over compatible public branches and private draws. Regret updates use those values for both players.

Behavioral averages at later decisions require own reach weighting. With linear iteration weights wₖ, the returned turn-six policy is

\[
\bar\sigma(z\mid h)=
\frac{\sum_k w_k\,\pi_k(t,a)\,\sigma_k(z\mid h)}
{\sum_k w_k\,\pi_k(t,a)}.
\]

Here πₖ(t,a) is the player's own turn-five action probability. Averaging the child probabilities without it generally fails to reproduce the average realization plan. A regression test explicitly checks the convex mixture of sequence probabilities. Independent Python bounds are evaluated on the actual returned average, not the latest regret-matching policy.

The foundational CFR result is [Zinkevich, Johanson, Bowling and Piccione (2007)](https://martin.zinkevich.org/publications/regretpoker.pdf). This implementation uses regret clipping and linear averaging; its acceptance criterion is the measured deviation bound. It does not reproduce or depend on GTO Wizard's proprietary software.

## Information-constrained verification

Against a fixed opponent policy, each terminal information set first sums indistinguishable hidden worlds and opponent actions, then takes the best legal final action. For each root action, these conditional best values are summed over possible public reveals and own draws. The best root action is then selected. Maximizing separately in each revealed hidden world would be a different, clairvoyant game.

The evaluator reports player zero's best-response upper bound U, the lower bound L obtained from player one's best response, global Nash gap U−L, and the largest conditional **root-private-type** full-continuation deviation gain. Both must meet the target to validate the supplied whole two-turn game. Action values from different algorithms are compared against the same frozen policy; different equilibria need not have the same mixtures or off-support action values.

A separate diagnostic reports the largest local continuation gain among information sets with own preceding realization and counterfactual reach above 1e-12. This diagnostic is not interchangeable with the root-type bound. The local terminal checker used for displayed decisions retains all positive-probability conditional types.

## Public posterior and local turn-six queries

Let ρ(t,u) be the initial joint private-type prior. After public commitments a,b and private draws d,e, the public-root conditional terminal model has unnormalized weight

\[
\rho(t,u)\,
\sigma_0(a\mid t)\,\sigma_1(b\mid u)\,
P(d\mid t,a)\,P(e\mid u,b).
\]

Changing the turn-five policies changes this posterior. The endgame reference couples the choices through realization flows, and the candidate propagates their current likelihoods during every iteration.

For a queried turn-six state, the returned two-turn policies are transferred into the derived conditional terminal model and checked again by the existing independent terminal-action evaluator. A globally small error may be concentrated in a rare public branch, so whole-game validation alone does not set that decision's status to validated. A regression example adds tiny exploration to a solved profile: the parent remains within tolerance while a newly reached child's policy fails the local test.

If the public pair has zero profile probability, Bayesian conditioning does not specify a public posterior. A one-sided counterfactual query can still have a well-defined value against the fixed opponent policy, but it remains provisional. If the observed opponent commitment itself has zero conditional reach, the query is unavailable. Neither case uses the actual stored opponent hand to invent a posterior.

This is not a safe full-game re-solving theorem. Beliefs at turn five are supplied; opening-equilibrium historical conditioning remains separate. No full-game private-history quotient or deck dominance result is proved here.
