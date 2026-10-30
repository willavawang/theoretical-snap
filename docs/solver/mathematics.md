# Mathematical target of the unrestricted solver

## Game definition

A pure strategy includes the player's private deck choice and a complete contingent plan for every observation history. Both players have the same 6,188 deck choices and legal numerical actions. Draws are chance events; an action depends only on the actor's observations, even though a simulated Game State Object contains the complete truth.

The game is finite, two-player and zero-sum, with utility +1, 0 or -1. Original private observations and public commitments are retained. The offline optimizer searches this strategy space rather than selecting a preset distribution of deck types.

## One exact result: the opening value is zero

Let u(s,t) denote player zero's expected outcome using strategy s against t, including all deck choices and draws.

The rules, initial empty board and chance distributions are symmetric between players. Swapping the players negates utility:

    u(s,t) = -u(t,s)

Consequently u(s,s) = 0 for every identical pair of strategies.

For every s, the opponent is allowed to use s, so min_t u(s,t) <= 0. Therefore the maximin value is at most zero.

For every t, the player is allowed to use t, so max_s u(s,t) >= 0. Therefore the minimax value is at least zero.

Finite zero-sum minimax equality gives the exact opening equilibrium value:

    v = 0

This does not identify an equilibrium strategy or an equilibrium deck mixture. Even a highly exploitable strategy draws against an identical copy on average. Conditional hand values and action values at later positions can also be positive or negative.

Thus the meaningful research target is a strategy that guarantees approximately zero against every legal opponent strategy, together with accurate conditional decision values. A near-zero self-play EV is insufficient evidence.

## Numerical equilibrium bounds

For a stored profile (s0,s1), define:

    U = max_t u(t,s1)
    L = min_t u(s0,t)

These deviations include both private deck selection and all subsequent legal play. L <= v <= U, and the profile's Nash gap is U - L.

Since v = 0 in the unrestricted symmetric opening game, a small global gap supplies a meaningful minimax guarantee. For example U - L <= 0.01 implies U <= 0.01 and L >= -0.01.

The exact small-game evaluator computes information-constrained best responses, sharing one action across indistinguishable histories. It must never choose separately after inspecting hidden opponent cards.

A restricted candidate-deck game only establishes bounds for that declared candidate universe. Unrestricted certification must account for every one of the 6,188 deck choices or use a valid exhaustive deviation oracle over them.

## What sampled tests establish

A learned deviation is a legal strategy, not necessarily an optimal response. Its payoff can prove that a stored opponent is exploitable. Failure to learn a profitable deviation does not prove that no such deviation exists.

The offline reports separate exhaustive numerical bounds from Monte Carlo value intervals and learned-deviation lower bounds. Sampling intervals do not include optimizer error.

Outcome-sampling updates divide sampled target-strategy values by behavior probabilities. The behavior policy explores both players' actions with full support. The target remains the regret-matched strategy; matching importance factors preserve the target expectation. Final-turn action enumeration averages all updater actions against a sampled opposing strategy without omitting choices.

Stored cumulative average strategies, rather than an arbitrary final training iterate, are used for evaluation.

## Root equilibrium versus every-position quality

An opening equilibrium bound weights future histories by their reach. It does not automatically establish accurate conditional play at every rare or off-equilibrium history.

The complete product objective therefore includes a separate arbitrary-position coverage requirement. An imported state must have a defined observation history/information model; generated Game State Objects already preserve it. Decision reports identify the model, strategy version, sampling uncertainty and availability.

Full-game certification and strong arbitrary-position coverage remain unresolved for the unrestricted run. The current checkpoint size and visited-state count are measurements of a training attempt, not estimates of the smallest fully solved artifact.
