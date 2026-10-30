# Theoretical Snap — accepted visual direction

Read this before changing a screen or adding a feature. These preferences came
from the user's review of several implemented versions and supplied references.

## Latest visual decision

In the screenshot review, the user identified the first purple workspace as
the only version with professional visual fidelity. Restore its original
layered surfaces, card artwork, fine borders, and spacing, then apply the
Akira-inspired palette. The stripped flat/paper treatment is superseded.
Richness should come from original graphic craft and material, while the
previously requested reduction of redundant interface copy still applies.

## The composition to preserve

The latest user correction rejects copying the side-chat prototype's board or card styling into the site. That HTML is an information-layout reference only. Restore the pre-results workspace (`340bb104c43a63b5f928e0282bf1717e586072ea`) and fit results around it.

Keep the existing three-column app: deck settings, the training workspace, and the right review sidebar. Submission must not expand the workspace across that sidebar. The three lanes retain their established width, height, interior spacing, and total positions. Opponent totals sit above their two-by-two slots; player totals sit below their slots. Preserve the location band between the two sides, original geometric card art, and angular turn rail. The latest card-proportion refinement fits portrait thumbnails into the existing slot-row heights; it does not adopt the handoff's board layout or move both totals into the middle.

Place EV loss in the existing topline above the board. Your EV and Maximum EV belong in the existing right sidebar. The complete-turn comparison sits below the unchanged board, in the review area that replaces the hand after submission. Your Move and Alternates remain equal-level headings outside selectable rows. Use a three-cell group aligned to the board plus the existing turn-rail gutter for row loss; do not add a wide fourth board column. A turn preserves composition such as 4+2.

Selecting a row changes only its preview; the submitted EV loss and both contextual EV values stay fixed. At narrow widths, move the two EV values above the board and the per-row loss beneath its move cells. Keep lane geometry unchanged through these state transitions. The hidden live announcer is anchored at the top, and the page reserves a stable scrollbar gutter, so announcements or taller results cannot resize the board.

## The reference language

- **Monochrome Akira poster:** charcoal ground, pale printed lettering, fine
  panel frames, controlled grain, graphic contrast, and substantial card forms.
- **Red/blue contour head:** delicate warm/cool edge registration and repeated
  contours create depth. Use fine red and blue ink as accents instead of broad
  saturated surfaces. Blue can identify the player's line and red the opponent's.
- **Reality/perception diagram:** print noise and compact, slightly forward
  typography give a sense of movement. Apply this to short display labels;
  keep numbers, controls, and body text upright and legible.
- **Wormhole/entanglement diagram:** fine curves and clearly connected endpoints
  explain a relationship across space. Future move explanations can connect
  the actual source, destination, and consequential opponent response.
- **Additional Akira mechanical linework:** small precise details support
  sophistication without increasing the amount of information to read.

References inform the visual grammar; the website uses original graphics.

## Colour and material

Keep charcoal, graphite, and off-white ink dominant. Use muted blue and red on thin contours,
small identity markers, and active placement states. Violet remains a quiet
secondary accent. Result green/yellow/red indicates evaluation and must remain
distinct from player/opponent identity. Pair evaluation colour with a symbol
and a plain-language verdict.

Use the original shallow layered gradients, subtle grain, delicate panel
frames, and controlled hatching. Dark hand cards regain the first version’s
geometric energy artwork and fine inner borders, with one central number.
Cost and power are the same in this model; avoid duplicate numeral badges.
Board-card numbers recede; lane totals and slot occupancy stay prominent. Empty slots, existing cards, queued cards, and alternative previews share the hand cards' 47:66 portrait ratio. Center their compact two-by-two grids and size them to the existing slot-row heights, scaling down without distortion when width is limited. Keep the lane footprint and score positions stable.
Leadership is computed from the revealed board only. It gets an edge glow and
a brighter, heavier unboxed total; ties get neither. Queued and submitted-but-
unresolved cards never change that highlight. Keep the revealed score primary in every state and show a small neutral projected total beside it while a turn is unresolved. Results and alternate previews use that same hierarchy; projections cannot change revealed leadership.
Group each total with its own two-by-two slots, inset from the frame; separate
the two players with a larger middle interval. Avoid lane chevrons and score
badges. Card artwork uses clean wireframe contours without counted dots. Use a single labeled Undo beside Submit;
Clear and the separate reset icon above the turn rail are removed.
The concealed-review graphic gives the panel an intentional inactive state.
Avoid heavy paper-card slabs, broad white frames, and flat monochrome recasts.

## Information and motion

Use functional labels. The board has no visible hand/board headings, duplicate
turn badge, lane-name captions, position counter, placement instructions, or
empty-results prompt. The numbered turn rail and energy meter provide state. Turn buttons are compact
fixed-size rectangles with clipped corners and equal gaps, vertically centered
beside the lanes, with a small TURN label above.
They never stretch to fill the board height.
Keep deck labels, actionable control names, error messages, and the exact-analysis scope. Show the known opponent hand before committing in a public-hand drill. Put mathematical definitions, outcome probabilities, and model explanations behind the analysis-details control. Do not restore the scoring legend or preview subheaders.

The promotional headline, motivational sidebar copy,
session-summary filler, and duplicate numerical labels were deliberately
removed. Do not restore them as part of a redesign.

Motion should explain a committed placement, a changed lane, or a comparison.
Use one primary path and reveal secondary response paths on demand. Respect
reduced-motion preferences. Keep totals and slots anchored during transitions.

## Results are a mathematical claim

See `docs/results-contract.md`. Distinguish action value from sampled outcome,
expected match score from win probability, and action quality from mixing
frequency. Label model scope and uncertainty. Exact grading now covers only the public-hand final-turn drill and its lane rotations. Other positions must show analysis unavailable. The default Midrange / Unknown workspace and deck presets are retained; the dedicated solved drill explicitly switches to Balanced decks with known hands. See `docs/results-contract.md` for coverage and scoring units.


## Playing-solver workbench

The numerical engine in `dist/solver/` and separate `dist/solver.html` workbench add configurable hidden deck ranges, CFR, full continuations, and measured accuracy diagnostics. They do not replace the trainer's bounded `dist/analysis.js` provider or alter its board geometry. Keep research controls and performance diagnostics in the workbench; integrating a validated general provider into the trainer is a separate change. See `docs/solver/README.md` and `docs/solver/engineering-report.md`.
