# Theoretical Snap

A web-based workspace for studying Marvel Snap fundamentals through numerical game abstractions.

## Milestone One — interactive visual mockup

The initial interface includes a responsive dark training workspace, a three-lane board, power totals, numerical cards, draggable placement, click and keyboard alternatives, energy and lane-capacity checks, undo, reset, six turn drills, player and opponent deck presets, custom decks, a Playground position editor, and a post-submission review layout.

**The numerical review values and mixing frequencies are illustrative interface fixtures. No solver grades the user's play.** They are labeled in the interface, including in the probability chart, expected-value panel, alternatives, and assumptions. The only personalized review text describes the user's actual energy use and lane allocation.

The browser does not simulate or reveal an opponent's current-turn action. Submitting commits the user's turn and opens the example review. Choosing another turn opens a preset drill; it does not rewind and re-solve the current history.

## Run locally

Open `theoretical-snap.html` directly in a browser for the self-contained mockup. It needs no server or external assets.

For source development, use Python 3 and a browser. Node.js is only used for the optional JavaScript syntax check. No packages or build step are required.

```sh
npm run dev
```

Open http://127.0.0.1:4173. The static website lives in `dist/`.

```sh
npm run check
```

Regenerate the standalone mockup after editing the source:

```sh
npm run export
```

## Numerical baseline

- 12-card decks; three opening cards and one draw at the start of each turn.
- Six turns, with energy equal to the turn number and no carryover.
- Power equals the printed energy cost. Cards have no abilities.
- Three neutral lanes; four slots per player per lane.
- Full current-turn plans are committed simultaneously.
- Win more lanes; if lane wins tie, use total power; equal total power is a draw.
- Proposed feedback objective: match score, with win = 1, draw = 0.5, loss = 0.

### Presets

| Deck | Card costs / power |
| --- | --- |
| Midrange | 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 6 |
| Low curve | 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5 |
| Balanced | 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6 |

These are explicit UI presets for this mockup; they are not asserted to reproduce the curves used in the earlier research archive. The default unknown-opponent prior is proposed as one-third of each preset. There is no belief-update engine in this milestone.

## Controls

- Drag a hand card into a lane, or select it and click a lane.
- Click a queued card to return it; drag it to another lane or the hand.
- `Z` undoes a placement; `1`, `2`, or `3` places a selected card in a lane.
- `Enter` submits when focus is on the workspace, or activates the focused native button.
- `Escape` cancels selection or closes a dialog.
- Tab, select a card, then focus a lane and press Enter for keyboard-only placement.

## Milestone Two

Connect validated solver positions and a defined analysis contract. Supply exact or approximate action values, appropriately conditioned hidden-state beliefs, the continuation policy, and equilibrium frequencies only where solved. Replace every illustrative review fixture before enabling real grading.

Later rule variants include different deck sizes, lane capacities, power-to-energy ratios, a seventh Limbo turn, and snapping/retreating with expected cube value. Each requires corresponding solver support.
