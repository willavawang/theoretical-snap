# Theoretical Snap

A study workspace for Marvel Snap fundamentals, using numerical game abstractions.

## Milestone One — visual abstraction

The interface centers on three lanes. Each side's power total is prominent; four quiet card slots show occupancy. Individual board-card values are deliberately faint, with accessible labels and hover/focus disclosure. Hand cards contain one energy bubble and one number.

The board has no permanent results sidebar. Submitting opens a compact overlay on the opponent's half:

1. A green check, yellow warning, or red cross and a concise verdict.
2. The magnitude of the example value loss.
3. Optional Why and Compare controls.

Compare replaces the verdict with a small comparison bar, reveals the opponent's totals, and previews a legal alternative on the player's side. Changed lane totals show before and after, with subtle movement arcs. The submitted plan is preserved.

Turns progress upward: 1 at the bottom and 6 at the top. Arrow up advances to a later turn while a turn button is focused. Each rail selection opens a preset drill rather than rewinding a played history.

Training and Playground remain available. Deck configuration, exact deck lists, model details, and additional-rule plans live in Settings. Playground provides a position editor.

## Example feedback, not solver grading

**Verdicts, value-loss amounts, and rationales are visual fixtures. They do not grade the user's move.** The overlay is explicitly labeled Example feedback. Settings can select Good move, Small loss, or Mistake to inspect all three states.

Compare demonstrates a legal alternative placement; it is not asserted to have higher expected value. No opponent response is simulated or revealed. Validated solver feedback is Milestone Two.

## Open and edit

Open `theoretical-snap.html` directly in a browser; it has no external dependencies or assets.

Editable source lives in `dist/`. No dependency installation or build step is needed.

```sh
npm run dev
```

This serves the website at http://127.0.0.1:4173 using Python 3.

```sh
npm run check
npm run export
```

The syntax check uses Node.js. The export regenerates the standalone HTML from the source.

## Numerical baseline

- 12 cards; three opening cards and one draw at the start of each turn.
- Six turns, energy equal to the turn number, no carryover.
- Power equals energy cost; no abilities or special locations.
- Three lanes with four slots per side.
- Full current-turn commitments are simultaneous.
- Win more lanes; tied lane wins use total power; equal power is a draw.
- Planned grading objective: win = 1, draw = 0.5, loss = 0.

| Deck | Card costs / power |
| --- | --- |
| Midrange | 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 6 |
| Low curve | 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5 |
| Balanced | 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6 |

These explicit interface presets are not asserted to reproduce the research archive's curves. The proposed Unknown opponent prior is one-third of each preset. Belief updating is not implemented in this milestone.

## Controls

- Drag a card into a lane, or select it and click a lane.
- Click a queued card to return it; drag it to another lane or back to the hand.
- Z undoes; 1, 2, or 3 places a selected card.
- Enter submits, advances, or activates the focused native button.
- Escape cancels selection or closes a dialog.
- Use Tab to focus controls; select a card, then focus a lane and press Enter.
- Pass by submitting an empty turn.

## Validation

JavaScript syntax and a DOM-state harness cover 120 deck/opponent/turn combinations, draw composition, energy and capacity, undo, passing, all three verdict fixtures, hidden feedback before submission, explanation toggling, alternative legality, before/after totals, preservation of the submitted plan, retry, custom input validation, and upward turn navigation.

Browser rendering has not been verified for this redesign because the execution environment disconnected.

## Next milestone

Connect validated solver positions, action values, properly conditioned hidden-state beliefs, a continuation policy, and equilibrium frequencies where solved. Replace illustrative feedback before enabling real grading.

Later variants include deck size, slot capacity, power-to-energy ratios, a seventh Limbo turn, and snapping/retreating with cube EV.
