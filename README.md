# Theoretical Snap

A numerical Marvel Snap study workspace.

## Current mockup — charcoal print

This revision returns to the first interface's layout: deck controls on the left, three tall lanes in the middle, and a side review on the right. Each lane preserves the opponent-above/player-below arrangement, two-by-two card slots, a middle location band, and power totals at opposing ends.

Styling takes high-level cues from the supplied monochrome Akira poster: strong light typography, charcoal surfaces, fine ink frames, subtle grain, and pale printed card faces. Faint violet and blue accents bring back a trace of Snap’s palette. Lane shading is shallower; card faces, the location band, and the empty review panel use flatter fills. No poster artwork is embedded. Hand cards have one numbered energy bubble; redundant cost/power corner numbers are removed. Individual board-card numbers are subdued while occupancy remains visible.

The promotional header, sidebar slogan, duplicate action note, and session summary are removed. The results hierarchy is verdict, percentage-point loss, then optional explanation and board comparison. Feedback stays in the side panel instead of covering the opponent's board. Turns retain upward progression, from 1 at the bottom to 6 at the top.

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

Browser rendering remains unverified.

## Later

Connect validated position values, hidden-state beliefs, continuation policies, and equilibrium frequencies where solved. Further variants include slot counts, deck sizes, power ratios, a seventh Limbo turn, and cube-value snapping/retreating.
