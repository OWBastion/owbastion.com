# Design Rules

Portal (`apps/portal`) UI rules. On the `next` concept branch the visual language is open for
experiment: color, type, radius, layout, components and motion are not prescribed. What remains
are the floors every design must keep.

| Change | Read |
| --- | --- |
| Responsive behavior, accessibility | [interaction-accessibility.md](interaction-accessibility.md) |
| Copy, states, explanatory text | [portal-copy-guidelines.md](portal-copy-guidelines.md) |
| Titles, challenges, statuses wording | [terminology.md](terminology.md) |
| Changelog Markdown | [changelog-guidelines.md](changelog-guidelines.md) |

## Principles

1. Say it with less: fewer words, sections, and controls; one primary action per screen;
   details on demand.
2. Colors come from the theme tokens in `main.css` so light and dark both work.
3. Color, icon, or position alone never carries meaning; honor reduced motion and contrast.
4. The API decides what renders for public, player, and admin; CSS is not access control.
5. Behavior and copy changes still follow `docs/product-rules/` and the terminology.
