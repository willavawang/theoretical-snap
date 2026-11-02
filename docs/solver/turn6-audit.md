# State representation audit

Scope: the agreed numerical game, neutral lanes, cost equal to power, simultaneous commitments, passing and underspending, no abilities/cubes/retreats. The implemented quotient is a **conditional final-turn game**, not a new full-game training representation.

## Three representations

| Representation | Required purpose | Treatment in this milestone |
| --- | --- | --- |
| Complete Game State Object | Actual cards, hidden truth/draw order, stable IDs, commitments and replay | Retained; no history or physical copies deleted |
| Player information | Public observations plus that player's private information | Hidden opponent truth excluded; arbitrary correlated signals remain distinguishable |
| Conditional terminal solver state | Sufficient data to define the last simultaneous game | Reduced only under the conditions proved below |

The old draw-history test asserts that two private draw strings get different keys. This checks faithful storage of the existing representation. It is not a theorem that all such distinctions are needed for strategic optimization. No global history-key replacement was made here.

## Terminal sufficient data and exact equivalences

Given the declared conditional belief model, terminal utility needs three revealed power differences, feasible actions under the public slot counts, and each action's added lane power. An absolute equal power offset to both players in a lane has no effect on utility. Board composition/history can still be needed to validate reachability or infer beliefs before the terminal game is constructed.

The compiler checks that this really is the final turn. A reduction proved here must not be applied to an intermediate turn merely because its immediate power additions agree.

### Identical copies and power-equivalent actions

Card copies of one cost have no distinct strategic effect under these rules. Their physical IDs remain in the replay object and submitted result. Each affordable submultiset is allocated to lanes without exceeding four slots. Passing and every affordable underspend are included.

Two legal actions with the same added power vector have identical utility against every opponent action at the terminal turn. Different consumed cards or occupied slots have no future consequence. Class probabilities can be split over any legal original members; original actions retain their individual EV rows.

There are 400 card-placement patterns in the global six-energy union, but at most 84 distinct power allocations (nonnegative triples summing to at most six). The union is across possible hands, not the action count for any one hand.

The code also merges rows that have identical integer payoffs against **every feasible opponent action in the supplied model**, and analogously merges identical columns. This is stronger than power-vector equivalence. Matching the outcome against just one opponent move would be insufficient. Every class is lifted back to legal original actions for each private type.

### Shared lane permutations

Applying one common permutation to all lane-indexed board data and both players' actions preserves affordability, capacity, the number of won lanes, total-power tie breaking and utility. The compiler chooses a canonical lane ordering internally. Original action membership supplies the reverse map for output.

Permuting each player's lanes independently is not this symmetry. Neutral-lane assumptions are necessary; location abilities would invalidate the proof. The complete external Game State Object is not rewritten into canonical order.

### Independent terminal information types

Let private types have independent conditional priors rho0(t) and rho1(u). Let C(t) be the set of available terminal payoff classes for type t. Against any opponent strategy, terminal expected utility depends on a player's strategy through its marginal class probabilities:

    q(a) = sum_t rho(t) * sigma(a | t).

Pool types that have the same C(t). For a pool with total mass W, define the pooled policy as the weighted average of its members' policies, divided by W. It has the same feasible class probabilities and therefore the same payoff against **every** opponent strategy. Conversely, a pool policy can be lifted to each member and then to its original legal card turns. Thus the feasible marginal-policy polytope, equilibrium value and information-constrained best-response values are preserved.

This proves that, for this conditional independent terminal game, unused remaining-deck composition and remembered private draw labels may be omitted when the available payoff classes match. They can still affect the calculation of the input prior. This theorem does not permit ignoring that calculation.

The implementation conservatively retains all original types for correlated joint priors. Pooling them would additionally require a valid equivalence of the conditional opponent-type distributions; matching hands/actions alone is insufficient.

### Why the default public posterior can factor

For independent deck choices and independent private draw randomness, fix a revealed public history H. Include all private chance events in each player's private trajectory t0 or t1. Its joint likelihood has the form

    P(t0) P(t1) L0(t0,H) L1(t1,H).

Conditioning on H normalizes each factor separately. Thus complete private trajectories remain conditionally independent in this model. Their probabilities nevertheless depend on historical strategy likelihoods L0/L1, not just card consistency. An arbitrary user-supplied correlated continuation prior falls outside this factorization assumption.

## Measured aliases and counterexamples

`solver/endgame/audit.cjs` exhaustively enumerates the balanced deck under a specified uniform legal historical policy. For five passes, one player's **8,910** private opening/draw histories produce **126** current hand/remaining-deck pairs. Two example traces differ only in draw order `.1.1.2.0.0` versus `.1.2.1.0.0` and have identical current resources. Zero denotes a skipped draw, not a burned card.

Across all legal decks, the same pass family has an exact combinatorial count:

- 126 opening four-card multisets;
- 216 ordered triples of later drawn costs, after which the hand is full;
- 252 possible five-card remaining multisets.

That is 6,858,432 remembered private trajectories, versus 199,584 current hand/deck states and 792 current hand multisets. These are counts of one specific public-history family. They are not a whole-game compression factor.

Public history cannot generally be replaced with the current board while omitting beliefs. With the balanced deck and uniform historical play, compare one cost-1 card left on turn one followed by passes against a pass then the same card left on turn two followed by passes. The final board, hand count seven and remaining-deck count four match. Exhaustive enumeration yields terminal-hand posteriors with total-variation distance approximately **0.0613773**.

This changes actual game values, not merely the names or weights of equivalent types. Give the other player an empty board, known hand `[1,1,2,3,4,5,6]` and remaining deck `[2,3,4,5,6]` in both cases. The conditional turn-six values are approximately **−0.46100927** and **−0.47858389**, a difference of **0.01757462** outcome EV. Both policies pass independent information-constrained best-response checks. Reproduce with `python3 scripts/solver/history-belief-control.py`; see `benchmarks/turn6/same-board-counterexample.json`. These are specified uniform-history posteriors, not equilibrium-history posteriors. Identical boards do not identify identical conditional games.

A second counterexample is deliberately outside the default independent-deck model. In the `correlated-signal` control, the querying player has the same hand and remaining cards in both cases but a private label reveals which opponent hand occurred. Its value is exactly **1**. Erasing the label produces value **1/2**. This guards the generic correlated-prior API. It is not evidence that private draw order is necessary in the standard independent opening game.

The `hidden-trap` control has value exactly **1/2**, while both hand-revealed games have value **1**. Averaging their optimal values would be clairvoyant analysis. Exact rational best-response certificates distinguish these games.

## What is not established for turns two through five

For a fixed current remaining multiset, the next private draw law is Markov: the probability of cost c is remaining[c]/sum(remaining), with a deterministic skipped draw when the hand is full. Equal current hands/decks therefore have equal own chance transitions. This alone is not a complete proof of strategic equivalence or of convergence for a history-forgetting CFR abstraction.

We have not proved that removing private draw order from the full sequential solver preserves every relevant information-constrained deviation and permits a correct policy lift. That proposal remains **unresolved**. The old full-game key was retained.

Earlier turns also retain card composition and slots. A legal turn-four play of one four-cost card and a play of two twos can add the same power but leave different hands and slot counts. Tests construct a reachable standard-rule example. In these rules a six-cost card is only playable on turn six, so six versus two-plus-four is specifically a terminal equivalence; four versus two-plus-two is the useful earlier-turn counterexample.

## Reduction ledger

| Proposal | Classification | Implemented scope |
| --- | --- | --- |
| Reject overspending, illegal ownership/capacity, impossible snapshots | Rules-based infeasibility | Independent action enumerators and reachability checks |
| Interchange identical-cost copies | Exact, under numerical-card rules | Strategic action generation; IDs retained for replay/results |
| Common lane permutation | Exact symmetry | Conditional terminal compiler and reverse output mapping |
| Replace absolute power totals with lane differences | Exact with beliefs fixed | Terminal payoff/key only |
| Same added power or same full payoff row/column | Exact terminal payoff equivalence | All original legal moves recoverable |
| Pool independent types with identical feasible payoff classes | Exact conditional strategic equivalence | Independent terminal priors only |
| Drop all private draw history in the sequential solver | Unresolved | Not applied |
| Treat equal current boards as the same game without beliefs | Invalid in general | Counterexample recorded |
| Pool arbitrary correlated types by hand alone | Invalid in general | Counterexample recorded |
| Require spending all available energy | Strategic assumption, not a rule | Not applied; passing is optimal in a forced-win control |
| Exclude a deck because of a bad endgame or one counterdeck | Unsupported full-game inference | No decks removed |

A weakly dominated action can still have zero EV loss and appear in an equilibrium. The forced-win control has all own moves, including passing, worth +1. The optimizer may share their payoff class, but the original passing move remains available for feedback. Differences in valid mixing frequencies are not errors by themselves.
