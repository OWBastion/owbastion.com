# Motion and Feedback

本文档负责 Portal 的动效、按压反馈、手势边界和系统偏好降级。
通用交互与无障碍见 [`interaction-accessibility.md`](interaction-accessibility.md)；
材料与 elevation 见 [`visual-foundation.md`](visual-foundation.md)。

## Principles

1. **Response first.** Feedback begins on pointer-down / activation, not only
   after the network returns.
2. **Content over spectacle.** Motion explains state change or continuity; it
   never exists only to decorate a static page.
3. **Interruptible where spatial.** Overlays and drawers use Nuxt UI / Reka
   focus and dismiss behavior; do not lock input for the duration of a custom
   animation.
4. **Optional.** Springs, haptics, and entrance choreography are never release
   requirements. Reduced motion must always remain correct.

## Allowed motion vocabulary

| Kind | Implementation | Notes |
| --- | --- | --- |
| Press | `pressable` / `pressable-soft` (shared) | Scale ≈ `0.97` / `0.985`; no one-off `:active` transforms |
| Theme change | `--theme-transition` on background/text | Respect reduced motion |
| Route change | Shared Nuxt `page` opacity transition only | No per-page slide/parallax |
| Overlay enter/exit | Nuxt UI Modal / Drawer / Menu defaults | Symmetric open/close; focus restore |
| Sticky scroll edge | `scroll-edge` / `scroll-edge-sticky` | Soft mask, not decorative parallax |
| Loading | Component `loading`, skeletons, disabled peers | Not shimmer-only without status text/semantics |

## Forbidden or restricted

- Page-local spatial route transitions (slide, push, shared-element) without an
  explicit design-system change.
- Looping ambient motion, full-viewport moving backgrounds, or near-0.2Hz
  oscillations.
- Gesture systems (custom drag, rubber-band, spring libraries) unless the
  surface is true direct manipulation **and** ships: grab-offset tracking,
  velocity handoff, interruptibility, and a reduced-motion non-spatial
  fallback. Default admin and player flows do not need this.
- Haptics as a required success path. If used later, fire on the causal frame
  with visual feedback; never alone.

## Reduced motion and related preferences

Implementations must honor:

| Preference | Behavior |
| --- | --- |
| `prefers-reduced-motion: reduce` | No spatial press scale, no slide/spring; opacity/color/border/background only |
| `prefers-reduced-transparency: reduce` | Glass → solid raised surfaces (`main.css` glass classes already solidify) |
| `prefers-contrast: more` | Stronger borders; do not rely on low-contrast glass text |

Do not reintroduce component-local `transform` transitions that bypass the
global reduced-motion rules in `main.css`.

## Feedback types

| Type | When | UI |
| --- | --- | --- |
| Status | Ongoing work | Loading on control, `aria-busy`, skeleton/status text |
| Completion | Successful commit | Toast or refreshed state; short factual copy |
| Warning | Recoverable attention | `warning` alert / badge + text |
| Error | Failed operation | `error` alert, named object, smallest next step |
| Press | Finger/pointer down | Immediate `pressable*` feedback |

Dangerous actions use `color="error"` and clear consequence copy. Authorized
admin decisions must not require optional reason text as a prerequisite
(product rule).

## Materials while moving

- Prefer animating opacity and theme colors over large layout thrash.
- Translucent chrome uses shared `glass*` classes; do not invent blur stacks.
- Elevation changes for interactive cards use shared `interactive-card` /
  elevation tokens, paired with press feedback — not hover-only lift.

## Refactor guidance

When refactoring motion:

1. Delete decorative entrance animations on static cards.
2. Replace local `:active { transform }` with `pressable` / `pressable-soft`.
3. Keep route transitions on the shared opacity policy.
4. Verify all three preference media queries on the touched surface.
