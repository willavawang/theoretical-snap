# Results contract

Implemented scope: the accepted results handoff, 2026-10-28. Exact analysis is connected only to the included public-hand final-turn fixture and its three lane rotations. General preset positions and edited positions are ungraded.

## Unit and information set

Evaluate a complete legal turn: every affordable card and lane assignment, including passing. Preserve card composition in each row. Relevant play order must be added to the model when abilities are introduced. Never grade using an opponent commitment learned after the player's decision.

The solved drill states the opponent's public hand before submission. In ordinary positions the opponent hand is unknown and analysis is unavailable. The proposed equal deck prior and belief updater have not been implemented; do not describe the current Unknown setting as an inference engine.

## EV convention

With cubes disabled, terminal outcome is win +1, draw 0, loss −1. Therefore `EV = P(win) − P(loss)`.

For information I, complete action a, hidden state h, opponent action b, and specified continuation policies:

`Q(I,a) = sum_h belief(h|I) sum_b opponent_policy(b|h,I) E[terminal_outcome|I,h,a,b]`.

`EV loss = max_a Q(I,a) − Q(I,chosen)` under the same beliefs, opponent policy, and continuation. This ranges from 0 to 2. It is not a probability, a percentage, or percentage points. The old expected-match-score convention `(EV + 1)/2` is equivalent for optimization but halves losses; its old pp fixtures must not be reused in this view.

An action's mixing frequency is a separate output. Equal-value actions tie on individual decision quality. A single less frequent action is not a mistake for that reason. Repeated mixing requires repeated observations; equilibria can be nonunique. Approximate future providers need numerical uncertainty and grading tolerances.

When an actual cube model is connected, optimize expected cubes and display cube EV/loss. Renaming or rescaling outcome EV does not add snapping or retreating.

## Committed versus revealed state

Leader classes, edge glow, and emphasis describe revealed board power only. Queued, submitted, and alternative cards remain unresolved and occupy real empty slots. Submission does not reveal or simulate an opponent commitment.

Before submission, the revealed total is primary with a small projected total. In results, the accepted handoff uses a small prior total and arrow next to the stronger projected figure. Neither projection changes the revealed-leader classification or establishes a lane win.

## Results hierarchy and comparison

1. Symbol and explicit text `EV loss: 0.40`, with real whitespace between label and number.
2. Your EV and Maximum EV beside the board, fixed to the original commitment.
3. Equal-level Your Move and Alternates headings outside selectable row boxes.
4. Every row is one complete three-cell turn, aligned to the board lanes, plus EV loss. Preserve composition such as `4+2`.
5. Clicking a row previews its whole turn in the same six four-slot grids. It never overwrites the submitted plan or its evaluation.
6. Explanations, W/D/L, scoring definition, and exact model scope are available in Analysis details. The main view has no scoring legend, frequency columns, or absolute EV in each comparison row.

At narrow widths, preserve the three lane tracks, move EV context above the board, and place a row's loss beneath its three cells. Unsupported positions show Analysis unavailable and offer the solved drill; never copy its values into an unrelated position.

## Verified public-hand fixture

Turn six, six energy each, both known hands `[1,2,4,6]`. Power equals cost, four slots per lane side, no abilities, special locations, future turns, snaps, or retreats. Win more lanes; tied lane wins use total power; equal total power draws.

Player totals `[1,5,9]`, opponent totals `[6,4,5]`.

The integration realizes existing cards as player `[[1],[2,3],[4,5]]` and opponent `[[1,5],[4],[2,3]]`. Each side has played exactly one card of each value 1 through 5, so the board can be reached before turn six and is compatible with the Balanced preset plus the stated hand. This replaces the handoff drawing's pre-turn-six six-cost card and ten-card opponent draw count. Baseline totals and all current legal actions remain unchanged.

All 40 legal card turns per side include passing and underspending. They produce 37 distinct power allocations. Duplicate allocations are not silently collapsed in turn notation.

One equilibrium player mixture is six Left 2/5, six Middle 1/5, four Middle plus two Right 2/5. One corresponding opponent mixture is six Middle 1/5, six Right 2/5, two Left plus four Middle 2/5.

The maximum player payoff against this opponent mix and minimum payoff against the player mix both equal 1/5. Runtime checks enumerate every legal deviation and verify both bounds using integer payoffs and weights over denominator five. Exactness applies to this matrix, not hidden hands or the whole game.

| Turn | W / D / L | Outcome EV | EV loss |
| --- | --- | ---: | ---: |
| Six Right | 40% / 0% / 60% | −0.20 | 0.40 |
| Six Left | 60% / 0% / 40% | +0.20 | 0.00 |
| Four Middle + two Right | 40% / 40% / 20% | +0.20 | 0.00 |
| Six Middle | 60% / 0% / 40% | +0.20 | 0.00 |

Against six Middle (20% of this reference opponent mixture), six Right loses while six Left wins. That branch accounts for their entire 0.40 EV difference. It is an explanatory counterfactual, not advance knowledge of the opponent's play. Lane outcomes are correlated; the provider computes joint match results rather than multiplying lane marginals.

`dist/analysis.js` is the bounded provider. `tests/analysis.test.cjs` verifies the rational bounds and action values. `tests/workspace.test.cjs` checks commitment/preview invariants and rendered slot structure without claiming browser layout coverage.

## Research archive coverage

The older v0.5 research archive's no-card allocation dynamic program permits all integer allocations of six points, unlike the card/energy/slot action space here. It is not the trainer's provider. Its restricted cube module covers a one-sided final-turn offer, without counter-snap or earlier cube-aware strategy; its portability issues also remain separate from this integration.
