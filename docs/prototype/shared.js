/* Shared helpers for the prototype pages. No framework, no build. */
const $=(s,r=document)=>r.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const P={
  award:'<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  back:'<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',right:'<path d="m9 18 6-6-6-6"/>',left:'<path d="m15 18-6-6 6-6"/>',down:'<path d="m6 9 6 6 6-6"/>',
  ok:'<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',circle:'<circle cx="12" cy="12" r="10"/>',check:'<path d="M20 6 9 17l-5-5"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',x:'<path d="M18 6 6 18M6 6l12 12"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3"/>',
  lock:'<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',plus:'<path d="M5 12h14M12 5v14"/>',
  copy:'<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  eye:'<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  globe:'<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  star:'<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
  map:'<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
  zap:'<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  image:'<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  msg:'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  history:'<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  cal:'<path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  trophy:'<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  hash:'<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  layout:'<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  more:'<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  fp:'<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
  shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  out:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  flame:'<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'
};
const ic=n=>`<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n]||''}</svg>`;
const stars=(n)=>`<span class="stars" role="img" aria-label="${n} 分，满分 5">${[1,2,3,4,5].map(i=>`<span class="${i<=Math.round(n)?'':'off'}">${ic('star').replace('<svg class="i"','<svg class="i" style="fill:currentColor"')}</span>`).join('')}</span>`;

/* persisted bench prefs (per-viewer convenience only) */
const PT={get(k,d){try{return localStorage.getItem('owb-proto-'+k)||d}catch{return d}},set(k,v){try{localStorage.setItem('owb-proto-'+k,v)}catch{}}};

const PUBLIC_NAV=[['events','随机事件'],['maps','地图'],['achievements','成就'],['changelog','版本更新'],['blog','开发日志']];

/* header: base = href prefix to portal.html ('' when already inside portal.html) */
function header(S,{base='',route='/',adminPage=false}={}){
  const h=p=>`${base}#/${p}`;
  const cur=p=>route===`/${p}`||route.startsWith(`/${p}/`);
  const links=PUBLIC_NAV.map(([p,l])=>`<a href="${h(p)}" ${cur(p)?'aria-current="page"':''}>${l}</a>`).join('');
  const role=S.role;
  const acct=role==='guest'
    ?`<a class="btn btn-primary btn-sm" href="${h('login')}">登录</a>`
    :`<a class="btn btn-primary btn-sm" href="${h('submit')}" aria-label="提交截图">${ic('upload')}<span class="btn-label">提交截图</span></a>
      <div class="acct"><button class="btn btn-outline btn-sm" data-act="menu" aria-label="账号菜单" aria-expanded="${!!S.menu}" aria-haspopup="menu">${ic('user')}<span class="btn-label">示例玩家</span>${ic('down')}</button>
      ${S.menu?`<div class="menu" role="menu"><a role="menuitem" href="${h('me')}">${ic('layout')}玩家中心</a><a role="menuitem" href="profile-267.html#/u/1">${ic('globe')}我的公开主页</a><a role="menuitem" href="${h('me/settings')}">${ic('gear')}个人设置</a>${role==='admin'?`<hr><a role="menuitem" href="${h('admin')}">${ic('shield')}管理后台</a>`:''}<hr><button role="menuitem" data-act="logout">${ic('out')}退出登录</button></div>`:''}</div>`;
  return `<header class="hdr"><a class="brand" href="${h('')}">躲避堡垒 3</a>
   <nav class="nav" aria-label="主导航">${adminPage?`<a href="${h('')}">${ic('back')} 返回站点</a>`:links}</nav>
   <div class="hdr-end">${acct}<button class="btn btn-ghost btn-sm menu-btn" data-act="sheet" aria-label="${S.sheet?'关闭菜单':'打开菜单'}" aria-expanded="${!!S.sheet}">${ic(S.sheet?'x':'menu')}</button></div></header>
   ${S.sheet?`<nav class="sheet-nav" aria-label="移动端主导航">${adminPage?`<a href="${h('')}">返回站点</a>`:links}</nav>`:''}`;
}

function dialog(d){
  if(!d)return '';
  return `<div class="scrim" data-act="scrim"><div class="dlg ${d.lg?'lg':''}" role="dialog" aria-modal="true" aria-label="${esc(d.title)}">
   <div class="dlg-h"><h2 class="h3">${d.title}</h2><button class="btn btn-ghost btn-sm" data-act="close" aria-label="关闭">${ic('x')}</button></div>
   <div class="dlg-b">${d.body}</div>${d.foot?`<div class="dlg-f">${d.foot}</div>`:''}</div></div>`;
}
const toast=S=>S.toast?`<div class="toast" role="status">${S.toast}</div>`:'';

/* bench: controls + frame + notes. extra = [{k,label,opts:[[v,l]]}] */
function bench({S,extra=[],render,onAct}){
  const seg=(k,opts)=>`<span class="seg" data-k="${k}">${opts.map(([v,l])=>`<button data-v="${v}" aria-pressed="false">${l}</button>`).join('')}</span>`;
  const ctl=[{k:'w',label:'宽度',opts:[['desktop','桌面'],['tablet','平板'],['phone','手机']]},{k:'theme',label:'主题',opts:[['light','浅色'],['dark','深色']]},{k:'role',label:'身份',opts:[['guest','访客'],['player','玩家'],['admin','管理员']]},...extra];
  $('#bench').innerHTML=`<div class="bar"><b>原型控制</b>${ctl.map(c=>`<span class="row" data-row="${c.k}" style="gap:.5rem">${c.label}${seg(c.k,c.opts)}</span>`).join('')}<span class="cap">示例数据，名称与数值均为占位</span></div>
   <div class="stage"><div class="frame" id="frame"></div></div><aside class="notes" id="notes" aria-label="设计说明"></aside>`;
  const sync=()=>{
    document.documentElement.dataset.theme=S.theme;$('#frame').dataset.w=S.w;
    document.querySelectorAll('.seg[data-k]').forEach(g=>g.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(S[g.dataset.k]===b.dataset.v))));
  };
  document.addEventListener('click',e=>{
    const sb=e.target.closest('.seg[data-k] button');
    if(sb){const k=sb.parentElement.dataset.k;S[k]=sb.dataset.v;if(['w','theme','role'].includes(k))PT.set(k,S[k]);if(k==='role'&&location.hash.startsWith('#/admin')&&S.role!=='admin')location.hash='#/';S.menu=false;S.sheet=false;return render()}
    const a=e.target.closest('[data-act]');
    if(!a){if(S.menu){S.menu=false;render()}return}
    const act=a.dataset.act;
    if(act==='scrim'&&e.target!==a)return;
    if(act==='menu'){S.menu=!S.menu;S.sheet=false}
    else if(act==='sheet'){S.sheet=!S.sheet;S.menu=false}
    else if(act==='close'||act==='scrim')S.dlg=null;
    else if(act==='logout'){S.menu=false;S.role='guest';PT.set('role','guest');location.hash='#/'}
    else if(onAct&&onAct(act,a,e)===false)return;
    render();
  });
  return sync;
}
function flash(S,render,msg){S.toast=msg;render();clearTimeout(flash.t);flash.t=setTimeout(()=>{S.toast='';render()},1800)}
function noteHTML(n){return `<h2>${n.t}</h2>${(n.b||[]).map(([h,t])=>`<h3>${h}</h3><p>${t}</p>`).join('')}${(n.l||[]).length?`<h3>约束</h3><ul>${n.l.map(x=>`<li>${x}</li>`).join('')}</ul>`:''}`}

/* full-site map for the notes panel; base = href prefix to portal.html */
function siteMap(base=''){
  const G=[['公开',[['','首页'],['events','随机事件'],['events/1','事件详情'],['maps','地图'],['maps/1','地图详情'],['achievements','成就'],['changelog','版本更新'],['blog','开发日志'],['blog/1','文章']]],
   ['账号',[['login','登录'],['bind','绑定 QQ'],['recover','恢复帐号']]],
   ['玩家（需登录）',[['me','玩家中心'],['me/settings','个人设置'],['submit','提交截图'],['submissions/1','提交详情']]],
   ['管理（需管理员）',[['admin','总览'],['admin/achievements','称号与挑战'],['admin/maps','地图'],['admin/maps/1','地图详情'],['admin/events','随机事件'],['admin/players','玩家'],['admin/players/1','玩家详情'],['admin/bindings','绑定与邀请'],['admin/player-reviews','评价审核'],['admin/reviews','截图审核'],['admin/reviews/1','审核详情'],['admin/verified-runs','通关记录'],['admin/screenshot-sets','截图集'],['admin/grants','手动授予'],['admin/titles','称号迁移'],['admin/channels','QQ 群']]]];
  return `<h3>全站页面</h3>`+G.map(([g,it])=>`<p class="cap" style="margin-top:.5rem">${g}</p><p style="display:flex;flex-wrap:wrap;gap:.25rem .75rem">${it.map(([p,l])=>`<a href="${base}#/${p}" style="color:var(--accent)">${l}</a>`).join('')}<a href="profile-267.html#/u/1" style="color:var(--accent);${g==='玩家（需登录）'?'':'display:none'}">公开主页</a></p>`).join('');
}
