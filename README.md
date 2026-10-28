# Theoretical Snap

A numerical Marvel Snap study workspace.

## Current mockup — original fidelity, charcoal ink

The original workspace supplies the visual foundation: three tall lanes, the
opponent above the player, two-by-two slots, layered surfaces, fine borders,
and detailed geometric hand-card artwork. A charcoal treatment adds subtle
red, blue, and violet cues, restrained print grain, and off-white typography.
The original stylesheet is retained with a focused `dist/akira.css` theme.

Redundant turn/hand/board/lane captions, promotional copy, placement hints, and
position counters stay removed. Each card has one central value and the same number of background pips. Leading lanes use an edge glow and emphasized totals; tied lanes stay neutral. Turn buttons remain compact circles across breakpoints. A single labeled Undo replaces the separate Clear and reset controls. A concealed
review graphic occupies the side panel before submission; results retain the
verdict-first hierarchy and compact Example disclosure.

## Design continuity

`DESIGN.md` records the latest screenshot review and visual direction. Read
`docs/results-contract.md` before connecting solver feedback.

## Example feedback

**Verdicts, losses, and explanations are illustrative fixtures, not solver grades.** The result panel labels them as examples. Its Example control cycles Good move, Small loss, and Mistake for design review. Compare previews a legal reallocation and preserves the submitted turn; it is not a certified higher-value line. No opponent response is simulated or revealed.

Validated solver feedback is the next milestone.

## Run or open

Open `theoretical-snap.html` directly in a browser. It has no external assets or dependencies.

Editable source is in `dist/`. Python 3 serves the development version; Node.js checks syntax.

```sh
npm run dev
npm run check
npm run export
```

The development URL is http://127.0.0.1:4173. Export regenerates the standalone HTML.

## Numerical model

- Twelve cards; three opening cards and one draw at the start of each turn.
- Six turns; energy equals the turn number and does not carry over.
- Power equals cost; no abilities or special locations.
- Three lanes with four slots per side.
- Both players commit complete current-turn plans before revealing them.
- Win more lanes; tied lane wins use total power; equal total power is a draw.
- Planned objective: win = 1, draw = 0.5, loss = 0.

| Deck | Costs / power |
| --- | --- |
| Midrange | 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 6 |
| Low curve | 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 5 |
| Balanced | 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6 |

These are interface presets rather than a claim to reproduce the research archive's curves. Unknown opponent proposes an equal prior over these presets. Belief updating is not implemented.

## Controls

Drag a card to a lane, or select it and click a lane. Click a queued card to return it. Z undoes; 1/2/3 places a selected card. Enter submits, advances, or activates the focused button; Escape cancels selection or closes a dialog. Submitting an empty turn passes.

The turn rail opens preset drills rather than rewinding the current history. Playground supports custom positions and decks.

## Validation

Syntax and a DOM-state harness cover 120 deck/opponent/turn combinations, draw composition, energy and capacity, comparison legality, undo, passing, all three verdict fixtures, hidden feedback, explanation and comparison controls, preservation of the submitted plan, retry, custom-value validation, and restoration of upper/lower power and slot-grid structure.

The published desktop appearance has been reviewed in its saved screenshot. Interactive browser testing remains unavailable.

## Later

Connect validated position values, hidden-state beliefs, continuation policies, and equilibrium frequencies where solved. Further variants include slot counts, deck sizes, power ratios, a seventh Limbo turn, and cube-value snapping/retreating.
