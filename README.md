# Theoretical Snap

A numerical Marvel Snap study workspace with the accepted charcoal / comic treatment and complete-turn results comparison.

## Results

Submit a turn to see EV loss above the board, Your EV and Maximum EV in the existing right sidebar, and the move comparison below the board. Your Move and Alternates share the board's three lane tracks. Selecting a row previews every card in its actual slots while the original EV loss, Your EV, and Maximum EV stay fixed. Card composition stays visible (`4+2`, not an interchangeable six). Unresolved plays never change the revealed lead glow.

The original layered workspace, geometric hand cards, subtle red/blue accents, angular turn rail, single Undo, and reduced interface copy are retained. Lane widths, heights, compact slot shapes, and totals above/below the respective slot groups retain their pre-results geometry. The side-chat HTML guides information placement, without replacing the site's board styling. The hand reappears on Retry.

## Analysis coverage

Exact grading covers the dedicated public-hand final-turn drill and its lane rotations. Open **Public-hand drill** from the concealed review panel, or use `?drill=public-hands`. Both hands are `[1,2,4,6]`; the drill explicitly switches to compatible Balanced decks. The opponent's hand is shown before commitment.

`?review=example` opens the accepted six-Right example directly in results mode. This is an explicit review/demo link; the ordinary root still opens Training with Midrange and Unknown selected and recommendations hidden.

Other preset turns, unknown-hand positions, and edited boards display **Analysis unavailable**. There are no fabricated verdicts or cycled example losses. The provider enumerates all 40 legal turns per side and certifies the finite equilibrium with exact integer payoff bounds. It is not a general hidden-hand or multi-turn solver.

Outcome EV = P(win) − P(loss). EV loss is the difference from the maximum available turn EV, on a 0–2 scale, not a percentage. Outcome probabilities and model scope are available on demand. No opponent commitment is sampled or revealed.

## Run and validate

```sh
npm run dev
npm run check
npm test
npm run export
```

Development: http://127.0.0.1:4173. Editable source is in `dist/`. Export regenerates the self-contained `theoretical-snap.html` with all styles and scripts embedded.

Tests cover both rational equilibrium bounds, all 40 legal actions across the three lane rotations, passing, distinct card compositions, unsupported information states, fixed submitted evaluation during previews, six four-slot grids, retry, undo, and fixture/deck compatibility. The DOM harness does not measure actual browser layout. Separate Chrome checks verified unchanged lane dimensions across submission and previews, exact comparison alignment, and a 375px viewport without horizontal overflow. Safari and physical-device checks remain unverified.

Read `DESIGN.md` and `docs/results-contract.md` before changing interface behavior or solver claims.

## Model and presets

Twelve cards per deck; three opening cards and one draw per turn. Six turns, energy equal to turn, power equal to cost, four slots per player per lane. Both players commit simultaneously. Win more lanes; tied lane wins use total power; equal total power draws. No abilities or special locations.

| Deck | Costs / power |
| --- | --- |
| Midrange | 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 6 |
| Low curve | 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5 |
| Balanced | 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6 |

Unknown opponent's proposed equal prior over presets and observed-play belief updates remain unimplemented. General preset boards are interactive layouts, not certified solver positions.

## Controls and later coverage

Drag a card or select it and click a lane. Click a queued card to return it. Z undoes; 1/2/3 places a selected card. Enter submits or advances; Escape cancels selection. An empty commitment passes. Retry restarts the same position; Next opens another drill, not a simulated continuation. The turn rail opens drills rather than rewinding history. Playground supports edited positions and custom decks.

Broader solving, hidden-hand beliefs, multi-turn continuation, and cube-aware snapping/retreating remain future work. Additional complexity levels require matching analysis providers.
