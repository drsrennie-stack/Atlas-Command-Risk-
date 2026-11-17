# Accessibility compliance notes

## 1. Project

- Project: Atlas Command (multiplayer territory game), nervous system release
- Files covered: public/index.html, public/atlas.css, public/atlas.js, public/maps/nervous.js, public/import.html
- Date: 2026-11-17 (palette changed from navy to black the same day; section 3 re-measured)

## 2. WCAG version and level

Target: WCAG 2.2 AA, with AAA contrast where achievable. "Checked" below means checked in code and in an automated browser run. A person has not yet tested with a screen reader (see section 5).

| Criterion | Level | Status |
|---|---|---|
| 1.1.1 Non-text content | A | Partly met. Controls and emblems have text names. Loops question images carry a general description only, because describing the highlighted structure would give the answer. See section 6. |
| 1.3.1 Info and relationships | A | Met. Landmarks, headings, lists, tables with header cells, fieldsets and legends, labels tied with for and id. |
| 1.4.1 Use of color | A | Met. Each side has a color, an emblem shape and a fill pattern. Correct and chosen answers carry text tags. |
| 1.4.3 Contrast (minimum) | AA | Met. See section 3. |
| 1.4.6 Contrast (enhanced) | AAA | Met for body text. The red headline word is large display text at 5.6:1 on the page and 4.2:1 on the brightest part of the hero (above the 4.5:1 AAA line for large text only on the page). |
| 1.4.10 Reflow, 1.4.4 Resize | AA | Met. One column below 900px. |
| 1.4.11 Non-text contrast | AA | Met. Territory outlines 9.6:1, focus ring 9.6:1 or better. |
| 2.1.1 Keyboard | A | Met. Territories, tabs, options and all buttons are reachable and work with Enter or Space. |
| 2.2.1 Timing adjustable | A | Not fully met. Turn and answer timers are part of play. The host can pause the match and can set longer answer time in setup. Students cannot extend their own time. See section 6. |
| 2.2.2 Pause, stop, hide | A | Met. Intro can be skipped. Moving outlines stop with the motion control. |
| 2.3.3 Animation from interactions | AAA | Met. Motion button plus prefers-reduced-motion. |
| 2.4.1 Bypass blocks | A | Met. Skip link. |
| 2.4.3 Focus order, 2.4.7 Focus visible | A, AA | Met. Gold 3px focus ring. |
| 2.5.8 Target size | AA | Met. Buttons 36px or taller, most 44px. |
| 3.3.1 and 3.3.2 Errors and labels | A | Met. Errors are text in alert regions. |
| 4.1.2 Name, role, value | A | Met. Territories are buttons with a name that states owner, strength and legal moves. Tabs use tab roles. Toggles use aria-pressed. |
| 4.1.3 Status messages | AA | Met. Turn changes and results go to a polite live region, errors to an alert region. |

## 3. Color contrast audit

| Pair | Text | Background | Ratio | Result |
|---|---|---|---|---|
| White text on page | #FFFFFF | #000000 | 21.0:1 | AAA |
| White text on card | #FFFFFF | #161616 | 18.1:1 | AAA |
| Soft text on page | #DADADA | #000000 | 15.0:1 | AAA |
| Soft text on card | #DADADA | #161616 | 12.9:1 | AAA |
| Gold eyebrow on page | #E0B861 | #000000 | 11.2:1 | AAA |
| Gold on card | #E0B861 | #161616 | 9.6:1 | AAA |
| Red headline word on page (large) | #DC5A4B | #000000 | 5.6:1 | AAA large |
| Red headline word on hero (large) | #DC5A4B | #222222 | 4.2:1 | AA large |
| Black on gold button | #000000 | #E0B861 | 11.2:1 | AAA |
| White on primary button | #FFFFFF | #A4402E | 6.3:1 | AA |
| Placeholder on input | #A8A8A8 | #0C0C0C | 8.2:1 | AAA |
| Error text on card | #FF9D8A | #161616 | 9.0:1 | AAA |
| Map label on board | #FFFFFF | #141414 | 18.4:1 | AAA |
| Board note labels | #BDBDBD | #121212 | 10.0:1 | AAA |
| Territory outline on board | #6FC3FF | #141414 | 9.6:1 | Pass |
| Side colors on page (gold, cyan, pink, green, violet, orange) | various | #000000 | 9.1:1 to 13.2:1 | AAA |

## 4. Keyboard flow checked

Skip link, sound, motion, rules, join form, host form (radio groups, checkboxes, selects), create room. In a match: tools, map view tabs, each territory in order, territory panel actions, connection buttons, answer options or answer field, submit, continue. Dialogs (rules, enlarged image) close with the Close button or Escape.

## 5. Screen reader testing

Not yet done by a person. Verified in code: one main landmark, heading order, live regions, button names on territories, table headers. Needs a pass with VoiceOver (Safari) and NVDA (Firefox) before wider release.

## 6. Known limits and plan

| Limit | Plan |
|---|---|
| Loops question images cannot be described without giving the answer. A student who cannot see the image cannot answer image identification questions. | Host can set Content to Physiology, or a future "text questions only" switch can exclude image cards for a room. |
| Timers cannot be extended by a student. | Host pause exists now. Add a per-room "no turn timers" switch. |
| Board is one SVG. On small phones the territories are small. | Territory names are also buttons in reading order. Consider a list view of territories. |
| Typed answers accept small spelling slips only. | Add a host overrule button. |
| Fonts load from Google Fonts. | Falls back to system fonts if blocked. |

## 7. Reviewer

Automated and code review by Claude on 2026-11-17. Human review: pending, Dr. Sharilyn Rennie.
