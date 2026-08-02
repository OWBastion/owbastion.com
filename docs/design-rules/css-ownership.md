# CSS Ownership

本文档负责 Portal CSS 的职责边界、共享模式抽取和页面级例外。

## Ownership rules

The Portal has one design system. Ownership follows responsibility rather than
file size:

1. `main.css`, Nuxt UI configuration, and shared tokens own semantic colors,
   type scale, materials, elevation, interaction feedback, touch targets,
   containers, focus, and reduced-motion/transparency/contrast policy.
2. Shared domain components or classes own stable patterns repeated across
   pages, especially when they carry semantics or behavior.
3. A reusable component may keep scoped CSS for its internal layout and state
   presentation.
4. A page may keep scoped CSS for its own composition: unique grids, sticky
   evidence/detail columns, responsive collapse, natural-aspect evidence, and
   structure-matched skeletons.

When a pattern appears twice, check whether it is stable; at three or more uses,
extract it or record why the instances are intentionally different. Do not
extract a one-off wrapper merely to reduce scoped CSS, and do not redefine
shared tokens, radii, elevations, materials, type, or container widths locally.
