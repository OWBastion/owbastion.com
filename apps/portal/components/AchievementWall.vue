<template>
  <div class="wall"><slot /></div>
</template>

<style scoped>
/* One display case for the whole collection: recessed, lit from above; each shelf sits inside it. */
.wall { --wall-glow: color-mix(in oklch, var(--accent) 10%, transparent); display: grid; padding: var(--space-2) clamp(var(--space-3), 3vw, var(--space-8)); border: 1px solid var(--line); border-radius: var(--radius-card); background: radial-gradient(90% 40% at 50% 0, var(--wall-glow), transparent 70%), color-mix(in oklch, var(--page) 94%, black); box-shadow: inset 0 1rem 2rem -1.5rem rgb(0 0 0 / .18); }
:is(html.dark) .wall { --wall-glow: color-mix(in oklch, var(--accent) 8%, transparent); background: radial-gradient(90% 40% at 50% 0, var(--wall-glow), transparent 70%), color-mix(in oklch, var(--page) 65%, black); box-shadow: inset 0 1px 0 rgb(255 255 255 / .05), inset 0 1rem 2rem -1.25rem rgb(0 0 0 / .7); }
</style>
