# Design Direction

Where the Portal's design is heading, and how to judge a change. Foundations (tokens,
units, a11y, permissions, terminology) always apply; this layer applies to new and
changed blocks; legacy code is a fact, not a template.

One line: **answer why the user came, then show the rest; the player side has game
texture, the admin side has working efficiency, on the same tokens.**

## Direction

1. **Answer the user's question first.** Center: "what next"; profile: "who am I, what have
   I done"; events: "where is it, what are the numbers"; review: "can this pass".
2. **One focus, three levels.** A focus, supporting blocks, then detail. No more than two
   equally weighted card groups per screen; hierarchy comes from size, weight, position, and
   accent, not more containers.
3. **Progressive disclosure.** Show what has started, fold what has not; summary first,
   detail on expand; fold long lists with a total. Folded content stays reachable.
4. **Tangible numbers.** Overview rows, segmented progress, probability bars, ranks,
   conversions ("about 1 in N triggers"); `tabular-nums`, unit and denominator secondary.
5. **Group and search by meaning** (series, event group, tag, slot), not forced time or
   version buckets. Stackable filter chips with counts, visible and clearable.
6. **Player texture, admin efficiency.** Player: profile card, equipped title, frame
   intensity by slot, one accent gradient on the focal card, glow on the top tier, pointer-only
   icon tilt. Admin: master/detail, edit in place, bulk actions, undo over confirm, no
   decoration. Same tokens, radii, type, and press feedback.
7. **Forgiving actions.** Reversible actions apply at once with an undo toast; confirm only
   irreversible or destructive ones, stating the consequence. Admin decisions never require
   a reason.
8. **Honest data.** Show only data the platform has; missing is "—" or omitted. A slot is a
   slot (border intensity plus text), not a rank. Unavailable actions are not rendered.
9. **Mobile is equal.** Same hierarchy; primary action first; filters in a drawer; touch
   targets at least `--control-lg`; nothing hover-only. Design the narrow order first.
10. **Motion serves control.** Only responses to action (press, pointer follow, overlays).
    No loops, entrance choreography, floating, sweeps, or pulses. The one exception: the
    leaderboard first-place card may have a slow foil light, static under reduced motion.

## Visual vocabulary

Built only from tokens; a new color means a new token. Limit: one radial gradient and one
glow class per page; no atmospheric blobs, stacked gradients, raw colors, or loops.

| Pattern | How | Reference |
| --- | --- | --- |
| Focal card | `surface-card elevation-2`, one accent radial gradient, accent-ringed avatar | `PlayerProfileHero` |
| Overview row | 3-4 large numbers, labels below, 1px dividers | `PlayerStatSheet` |
| Intensity ladder | accent mixed on `--surface-raised` 7%, 14%, 24%; glow only at top; always with text | `PlayerTitleMark` |
| Segmented progress | equal segments, reached `--accent`, rest `--line` | `PlayerNextGoals` |
| Series shelf | card per series, one row of icons, overflow folded with total | `PlayerTitleShelf` |
| Detail overlay | Nuxt UI overlay with large image and conditions | `PlayerTitleInspectDialog` |
| Pointer tilt | `useIconTilt`; fine, hovering pointers only; off under reduced motion | `PlayerTitleBadge` |

## Old and new

Old and new designs coexist. A block is "new" if built from this direction and the
references above; no page-migration list is kept (code and PRs are the record).

1. Legacy is not precedent; "same as the next page" is not a reason.
2. New blocks in old pages use the new language.
3. Migrate whole blocks or pages, not one old block piecemeal; neighbors stay coherent via
   shared tokens (`surface-card`, radius roles, type roles).
4. Touching means moving forward: no new legacy patterns, fixed `px`, local colors,
   equal-weight card walls, or hover-only information. Small fixes need not redesign; explain
   unmet items in the PR.
5. Extract a pattern on its third use ([css-ownership.md](css-ownership.md)).
6. If a rule blocks a direction-aligned design, change the rule in the same PR.
7. Whole-page migration is its own PR; do not widen a bugfix.
8. When an old pattern is fully replaced, delete it from code and docs.

## PR checklist

- [ ] The page opens by answering why the user came; one focus.
- [ ] Three content levels; no wall of equal cards.
- [ ] Empty or not-started content folds but stays reachable.
- [ ] Numbers are comparable (overview, progress, probability, conversion).
- [ ] Grouping and search follow meaning.
- [ ] Reversible actions undo; confirmation only for irreversible ones.
- [ ] Only existing data; missing is "—"; no invented grades or ranks.
- [ ] Narrow order and primary action match wide; touch targets pass; no hover dependence.
- [ ] Motion only responds to action; static and complete under reduced motion.
- [ ] No new raw colors, size/weight/radius/spacing literals, or page-level fixed action bars.

## Next

Public player home: a shareable view atop the profile (fields TBD). Promote to
page-archetypes once decided and delete here.
