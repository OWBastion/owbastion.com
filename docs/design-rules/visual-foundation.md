# Visual Foundation

本文档负责 Portal 的共享视觉语言：语义 token、颜色状态、字体层级、材料和深度。
实现来源是 [`apps/portal/assets/css/main.css`](../../apps/portal/assets/css/main.css)。

## Design priorities

1. Make the current content, state, and next action obvious.
2. Reuse the existing Portal tokens and components before adding variation.
3. Keep motion, material, and decoration subordinate to content and operation.
4. Preserve permission boundaries and distinguish unavailable, in-progress,
   completed, and future states.

## Visual foundation

- Use semantic tokens from `apps/portal/assets/css/main.css`: `--page`,
  `--surface`, `--surface-raised`, `--text`, `--muted`, `--quiet`, `--line`,
  `--line-strong`, `--accent`, `--accent-surface`, `--info`, `--info-surface`,
  `--success`, `--success-surface`, `--danger`, `--warning`,
  `--disabled-text`, and `--disabled-surface`.
- Use `page-shell` for readable page content, `page-shell--narrow` for compact
  forms/detail views, and `page-shell--wide` for data-dense admin workspaces.
  Their shared maximum widths are approximately `1100px`, `760px`, and
  `1440px`; use the existing shared gutters rather than redefining a container
  in a page or component.
- Use the shared type scale: `type-display`, `type-title`, `type-headline`,
  `type-body`, `type-caption`, and `type-kicker`. Do not introduce one-off
  heading tracking or a page-local font system.
- Use `glass`, `glass-heavy`, `glass-chip`, `glass-segment`, and
  `elevation-1/2/3` for materials and depth. Do not add isolated blur,
  shadow, or color vocabularies.

### Semantic state mapping

State color communicates a state in addition to its text or accessible
semantics; it never carries the meaning alone.

| State | Tokens / Nuxt UI color | Use |
| --- | --- | --- |
| Informational | `--info`, `--info-surface` / `info` | neutral progress or contextual guidance |
| Pending / warning | `--warning` / `warning` | waiting, attention, or a recoverable problem |
| Completed / success | `--success`, `--success-surface` / `success` | completed, accepted, or confirmed |
| Error | `--danger` / `error` | failed operation or dangerous consequence |
| Disabled | `--disabled-text`, `--disabled-surface` | unavailable controls; pair with `disabled` semantics |

The orange accent is reserved for primary brand action and active emphasis; it
is not a generic success color.
