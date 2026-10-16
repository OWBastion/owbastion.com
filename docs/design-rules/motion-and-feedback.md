# Motion and Feedback

Principles: response first (feedback starts on pointer-down, not after the network); content over
spectacle; interruptible overlays via Nuxt UI/Reka (no input lock for custom animation); motion is
optional and reduced motion always stays correct. Baseline: [interaction-accessibility.md](interaction-accessibility.md).

## Allowed

| Kind | Implementation | Notes |
| --- | --- | --- |
| Press | `pressable` / `pressable-soft` | scale about 0.97 / 0.985; no one-off `:active` transforms |
| Theme change | `--theme-transition` | respects reduced motion |
| Route change | shared `page` opacity transition | no slide or parallax |
| Overlay | Nuxt UI Modal/Drawer/Menu defaults | symmetric open/close, focus restore |
| Title icon tilt | `useIconTilt` + `PlayerTitleBadge`/inspect dialog | fine hovering pointer only, at most 14 degrees with glare, returns on leave, never loops or on touch/keyboard focus |
| Scroll edge | `scroll-edge` / `scroll-edge-sticky` | soft mask, not parallax |
| Loading | component `loading`, skeletons, disabled peers | not shimmer-only without status text |

## Forbidden or restricted

- Page-local spatial route transitions (slide, push, shared-element); looping ambient motion or
  moving full-viewport backgrounds.
- Gesture systems (custom drag, rubber-band, springs) unless true direct manipulation that ships
  grab-offset tracking, velocity handoff, interruptibility, and a non-spatial reduced-motion
  fallback.
- Haptics as a required success path (if ever used, on the causal frame with visual feedback).
- Component-local `transform` transitions that bypass the global reduced-motion rules.

## Preferences

| Preference | Behavior |
| --- | --- |
| `prefers-reduced-motion: reduce` | no spatial scale, slide, or spring; opacity/color/border/background only |
| `prefers-reduced-transparency: reduce` | glass becomes solid raised surfaces |
| `prefers-contrast: more` | stronger borders; no reliance on low-contrast glass text |

Verify all three on a touched surface. Translucent chrome uses shared `glass*`; interactive card
elevation uses `interactive-card` plus press feedback, not hover-only lift. Delete decorative entrance
animations on static cards and replace local `:active { transform }` with `pressable*`.

## Feedback types

| Type | When | UI |
| --- | --- | --- |
| Status | ongoing work | `loading`, `aria-busy`, skeleton or status text |
| Completion | successful commit | toast or refreshed state, short factual copy |
| Undo | reversible write succeeded | completion toast with "撤销" restoring previous values (instead of confirming) |
| Warning | recoverable attention | `warning` alert or badge plus text |
| Error | failed operation | `error` alert naming the object and smallest next step |
| Press | pointer down | immediate `pressable*` feedback |

Authorized admin decisions never require an optional reason.
