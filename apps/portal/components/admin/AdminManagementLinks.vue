<template>
  <section class="management-links" aria-labelledby="management-links-title">
    <div class="links-heading"><p class="eyebrow">功能</p><h2 id="management-links-title">管理项目</h2></div>
    <div class="links-list">
      <NuxtLink class="management-link" to="/admin/players"><strong>玩家</strong><span>帐号、绑定与状态</span><i aria-hidden="true">→</i></NuxtLink>
      <NuxtLink class="management-link" to="/admin/channels"><strong>QQ 渠道</strong><span>群组开放状态</span><i aria-hidden="true">→</i></NuxtLink>
      <NuxtLink class="management-link" to="/admin/achievements"><strong>成就</strong><span>挑战目录与规则</span><i aria-hidden="true">→</i></NuxtLink>
      <NuxtLink class="management-link" to="/admin/maps"><strong>地图</strong><span>评级、机制与挑战</span><i aria-hidden="true">→</i></NuxtLink>
      <NuxtLink class="management-link" to="/admin/events"><strong>事件</strong><span>目录、挑战与导入</span><i aria-hidden="true">→</i></NuxtLink>
      <NuxtLink class="management-link" to="/admin/titles"><strong>称号迁移</strong><span>历史称号关联</span><i aria-hidden="true">→</i></NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.links-heading { margin-bottom:14px; }.links-heading .eyebrow { margin-bottom:6px; }.links-heading h2 { margin:0; font-size:clamp(1.35rem,3vw,1.85rem); letter-spacing:-.05em; }.links-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); border-top:1px solid var(--line); }.management-link { display:grid; grid-template-columns:minmax(110px,.7fr) minmax(0,1fr) auto; gap:14px; align-items:baseline; min-height:67px; padding:18px 4px; border-bottom:1px solid var(--line); color:var(--text); text-decoration:none; transition:padding 160ms ease,background 160ms ease; }.management-link:nth-child(odd) { padding-right:18px; border-right:1px solid var(--line); }.management-link:nth-child(even) { padding-left:18px; }.management-link:hover,.management-link:focus-visible { padding-inline:10px; background:color-mix(in oklch,var(--surface-raised) 64%,transparent); }.management-link span { color:var(--quiet); font-size:.78rem; }.management-link i { color:var(--accent); font-style:normal; }
@media (max-width:720px) { .links-list { grid-template-columns:1fr; }.management-link:nth-child(odd),.management-link:nth-child(even) { padding-inline:4px; border-right:0; } }
@media (max-width:480px) { .management-link { grid-template-columns:1fr auto; gap:4px 14px; }.management-link span { grid-column:1; }.management-link i { grid-column:2; grid-row:1 / span 2; } }
</style>
