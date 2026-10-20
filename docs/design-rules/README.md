# Design Rules

Portal (`apps/portal`) UI rules. On the `next` concept branch the visual language (color, type,
radius, layout) is open for experiment. The UI stack is not: every design uses the designated
libraries, and the accessibility, copy, and terminology floors always apply.

| Change | Read |
| --- | --- |
| Libraries, components, icons, animation, tables, state | [ui-stack.md](ui-stack.md) |
| Responsive behavior, accessibility | [interaction-accessibility.md](interaction-accessibility.md) |
| Copy, states, explanatory text | [portal-copy-guidelines.md](portal-copy-guidelines.md) |
| Titles, challenges, statuses wording | [terminology.md](terminology.md) |
| Changelog Markdown | [changelog-guidelines.md](changelog-guidelines.md) |

## Principles

1. Say it with less: fewer words, sections, and controls; one primary action per screen;
   details on demand.
2. Reuse an installed library before building a component or behavior ([ui-stack.md](ui-stack.md)).
3. Colors come from the theme tokens in `main.css` so light and dark both work.
4. Color, icon, or position alone never carries meaning; honor reduced motion and contrast.
5. The API decides what renders for public, player, and admin; CSS is not access control.
6. Behavior and copy changes still follow `docs/product-rules/` and the terminology.
