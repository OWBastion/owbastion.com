/* Screenshot review workspace prototype. Loaded before the main script; all globals (S, ic, badge, ...) are resolved at call time. */
const RVK={ok:['可通过','ok'],confirm:['需确认','warn'],none:['无法通过','bad'],spot:['抽检','info']};
const RVR={map:[560,30,800,70],diff:[560,30,800,70],player:[110,905,420,60],done:[190,395,1540,100],variant:[1480,30,400,70],achv:[40,100,320,300]};
const RVCH=[['示例地图二 主宰','地图称号'],['示例地图二 征服者','地图称号'],['示例成就挑战','称号挑战']];
const RVITEMS=(()=>{
  const kinds=['ok','confirm','none','spot','ok','confirm','ok','none','ok','confirm','ok','ok'],maps=['示例地图二','示例地图一','示例地图三','示例地图六','示例地图二','示例地图五','示例地图一','示例地图八','示例地图六','示例地图二','示例地图一','示例地图三'];
  const players=['Fajacy','示例玩家 B','示例玩家 C','示例玩家 D','示例玩家 E','示例玩家 F','示例玩家 G','示例玩家 H','示例玩家 I','示例玩家 J','示例玩家 K','示例玩家 L'];
  return kinds.map((kind,i)=>({id:i+1,kind,map:maps[i],diff:i%3===0?'困难':'普通',player:players[i],wait:`${(i*37+12)%180+5} 分钟`,time:`9月26日 ${String(11-Math.floor(i/4)).padStart(2,'0')}:${String((i*13)%60).padStart(2,'0')}`}));
})();
const RV={st:{},done:{},pend:'',edit:'',add:'',filter:'all',auto:true,full:false,more:false};
const VW={k:1,x:0,y:0,fit:true,drag:null};
const rvSt=id=>RV.st[id]||(RV.st[id]={confirmed:[],added:[],corr:{},ok:{}});
const rvLeft=()=>RVITEMS.filter(i=>!RV.done[i.id]);
function rvFields(it){
  const cf=it.kind==='none'?[.41,.93,.9,.96,.8,.7]:it.kind==='confirm'?[.98,.95,.91,.97,.58,.83]:[.98,.95,.91,.97,.86,.9];
  const vals=[it.kind==='none'?'未识别':it.map,it.diff,it.player,'已完成','标准','52 / 52'];
  const rg=['map','diff','player','done','variant','achv'];
  return ['地图','难度','玩家名称','通关标记','地图版本','成就面板'].map((k,i)=>({key:rg[i],k,v:vals[i],cf:cf[i],r:RVR[rg[i]]}));
}
function rvApprovable(it){const s=rvSt(it.id);return it.kind==='ok'||(it.kind==='confirm'&&s.confirmed.length>0)||(it.kind==='none'&&s.added.length>0)}
function rvShot(it){
  return `<svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="玩家提交的挑战截图（示意）"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a1d14"/><stop offset="1" stop-color="#0f0b08"/></linearGradient></defs>
  <rect width="1920" height="1080" fill="url(#g)"/><g font-family="-apple-system,PingFang SC,sans-serif" fill="#f3e6d3">
  <text x="960" y="78" font-size="34" text-anchor="middle" fill="#d9c8ae">${it.kind==='none'?'—':it.map+' · '+it.diff}</text>
  <text x="1880" y="78" font-size="28" text-anchor="end" fill="#a8977f">标准版本</text>
  <rect x="40" y="100" width="300" height="300" rx="8" fill="#00000066"/><text x="60" y="140" font-size="26" fill="#f3e6d3">英雄: 52 / 52</text>
  ${[0,1,2,3,4].map(n=>`<text x="60" y="${185+n*42}" font-size="22" fill="#a8977f">成就 ${n+1}　已完成</text>`).join('')}
  <text x="960" y="470" font-size="44" font-style="italic" text-anchor="middle" fill="#fff6e6">祝贺 ${it.player.replace(/\s/g,'')} 以 211 次阵亡 &amp; 0 次跳过 耗时 3 小时27 分55 秒 通关!</text>
  <rect x="700" y="640" width="520" height="140" rx="12" fill="#00000055"/><text x="960" y="720" font-size="30" text-anchor="middle" fill="#8fd18f">✓ 挑战完成</text>
  <text x="130" y="950" font-size="34" fill="#f3e6d3">${it.player.replace(/\s/g,'')}</text><rect x="110" y="985" width="360" height="26" fill="#d97a2b"/></g></svg>`;
}

/* ---------- queue ---------- */
function rvQueue(){
  const left=rvLeft(),cnt=k=>left.filter(i=>k==='all'||i.kind===k).length,list=left.filter(i=>RV.filter==='all'||i.kind===RV.filter);
  return `<div class="row between"><h1 class="h1">截图审核</h1>${list.length?`<a class="btn btn-primary btn-lg" href="#/admin/reviews/${list[0].id}">开始审核 ${ic('right')}</a>`:''}</div>
  <div class="evflt" style="margin-top:var(--space-4)" role="group" aria-label="按预判筛选">${[['all','全部待处理'],['ok','可通过'],['confirm','需确认'],['none','无法通过'],['spot','抽检']].map(([k,l])=>`<button class="fchip" data-act="rvf" data-v="${k}" aria-pressed="${RV.filter===k}">${l}<span class="n num">${cnt(k)}</span></button>`).join('')}
   <span class="cap" style="margin-left:auto">按提交时间，最早的在前</span></div>
  <div class="card clip mt">${list.length?list.map(it=>`<a class="rvrow" href="#/admin/reviews/${it.id}"><span class="thumb" aria-hidden="true"></span><span><span class="val">${it.map} · ${it.diff}</span><br><span class="cap">${it.player}</span></span><span class="cap num">${it.time}</span>${badge(RVK[it.kind][0],RVK[it.kind][1])}<span class="cap num">已等待 ${it.wait}</span></a>`).join(''):`<div class="empty"><span class="h3">${left.length?'这个分类已处理完':'队列已清空'}</span>${left.length?'':'<button class="btn btn-outline" data-act="rvreset">重置演示数据</button>'}</div>`}</div>`;
}

/* ---------- detail ---------- */
function rvDecision(it){
  const s=rvSt(it.id),ap=rvApprovable(it),k=it.kind;
  const band=k==='spot'?['info','自动判定的结果，抽检确认即可']:k==='ok'||ap?['ok','识别结果满足条件，可直接通过']:k==='confirm'?['warn','需要你确认一项']:['bad','当前证据没有匹配到 Challenge'];
  const titles=k==='ok'||k==='spot'?['示例地图二 征服者']:k==='confirm'&&ap?['示例地图二 主宰']:s.added.map(i=>RVCH[i][0]);
  const outcome=titles.length?`<div class="outcome"><span class="lbl">${k==='spot'?'已获得':'通过后将产生'}</span><span class="big">${titles.map(t=>`获得「${t}」`).join('；')}</span><span class="cap">${k==='spot'?'由自动判定发放':`记录 1 次${it.diff}通关`}</span></div>`:`<div class="outcome"><span class="big">不会产生称号或通关记录</span><span class="cap">请校正识别字段、搜索添加 Challenge，或要求重新提交。</span></div>`;
  const cand=k==='confirm'?`<div><div class="lbl">截图能证明以下 Challenge 吗？</div><div class="cand mt" data-on="${s.confirmed.includes(0)}"><span><span class="val">示例地图二 主宰</span><br><span class="cap">地图称号 · 缺少地图版本</span></span><button class="tog" role="switch" aria-checked="${s.confirmed.includes(0)}" aria-label="截图可证明：示例地图二 主宰" data-act="rvcand" data-i="0"></button></div></div>`:'';
  const q=RV.add.trim(),res=k==='none'?RVCH.map((c,i)=>[c,i]).filter(([c,i])=>!s.added.includes(i)&&(!q||c[0].includes(q))):[];
  const add=k==='none'?`<div><label class="lbl" for="rvadd">添加 Challenge</label><div class="search mt" style="max-width:none">${ic('search')}<input class="inp" id="rvadd" data-rvadd placeholder="输入称号、地图或条件" value="${esc(RV.add)}"></div>${res.length?`<div class="card list clip mt">${res.map(([c,i])=>`<div><span><span class="val">${c[0]}</span> <span class="cap">${c[1]}</span></span><button class="btn btn-outline btn-sm" data-act="rvaddc" data-i="${i}">添加</button></div>`).join('')}</div>`:''}</div>`:'';
  let btns;
  if(RV.pend){
    const T={resub:['要求重新提交','玩家会看到“需重新提交”，并可以上传新的截图。'],reject:['驳回','玩家会看到“未通过”。'],revoke:['撤销称号','玩家将失去本次自动获得的称号，相关通关记录也会失效。']}[RV.pend];
    btns=`<div class="pendrow"><span class="val">${T[0]}</span><span class="cap">${T[1]}</span><input class="inp" data-rvnote placeholder="给玩家的说明（可选）" aria-label="说明（可选）"><div class="row"><button class="btn ${RV.pend==='resub'?'btn-primary':'btn-danger'}" data-act="rvyes">确认${T[0]} <kbd>⏎</kbd></button><button class="btn btn-ghost" data-act="rvno">取消 <kbd>Esc</kbd></button></div></div>`;
  }else if(k==='spot'){
    btns=`<div class="decide"><button class="btn btn-primary go" data-act="rvspot">确认抽检 <kbd>A</kbd></button><button class="btn btn-danger" style="grid-column:1/-1" data-act="rvpend" data-v="revoke">撤销称号 <kbd>X</kbd></button></div>`;
  }else{
    btns=`<div class="decide"><button class="btn btn-primary go" data-act="rvok" ${ap?'':'disabled'}><span>${ic('check')} 通过</span><kbd>A</kbd></button>
     <button class="btn btn-outline" data-act="rvpend" data-v="resub">要求重新提交 <kbd>R</kbd></button><button class="btn btn-danger" data-act="rvpend" data-v="reject">驳回 <kbd>X</kbd></button></div>${!ap?`<p class="cap">${k==='confirm'?'确认上方的 Challenge 后即可通过。':'添加一项 Challenge 后即可通过。'}</p>`:''}`;
  }
  return `<section class="rvcard" aria-label="审核决定"><div class="band ${band[0]}">${ic(band[0]==='ok'?'ok':band[0]==='bad'?'x':'info')}${band[1]}</div><div class="rvbody">${outcome}${cand}${add}${btns}</div></section>`;
}
function rvFieldsCard(it){
  const s=rvSt(it.id),fl=rvFields(it),warn=fl.filter(f=>f.cf<.8&&!s.ok[f.key]&&!(f.key in s.corr)).length;
  return `<section class="rvcard" aria-labelledby="fh"><div class="row between" style="padding:var(--space-3) var(--space-4)"><h2 class="h3" id="fh">识别核对</h2><span class="cap">${warn?`${warn} 项置信度低`:'全部可信'} · 悬停定位，点击放大</span></div>
   <div>${fl.map(f=>{const c=f.key in s.corr,low=f.cf<.8&&!s.ok[f.key]&&!c;
    if(RV.edit===f.key)return `<div class="fld"><span class="k">${f.k}</span><input data-rvedit="${f.key}" value="${esc(c?s.corr[f.key]:f.v)}" aria-label="${f.k}的正确值"><span class="row" style="gap:.25rem"><button class="btn btn-primary btn-sm" data-act="rvsave" data-k="${f.key}">保存</button></span></div>`;
    return `<div class="fld ${low?'warn':''}" data-r="${f.r.join(',')}" data-act="rvzoom"><span class="k">${f.k}</span><span class="v">${c?esc(s.corr[f.key]):f.v}${c?' <span class="badge info">已校正</span>':''}</span><span class="row" style="gap:.25rem"><span class="cf num">${Math.round(f.cf*100)}%</span>${low?`<button class="btn btn-ghost btn-sm" data-act="rvfok" data-k="${f.key}" aria-label="确认${f.k}无误" title="确认无误">${ic('check')}</button>`:''}<button class="btn btn-ghost btn-sm" data-act="rvedit" data-k="${f.key}" aria-label="校正${f.k}" title="校正">${ic('gear')}</button></span></div>`}).join('')}</div></section>`;
}
function rvDetail(id){
  const it=RVITEMS.find(x=>x.id==id);
  if(!it)return `<div class="rvw"><div class="card empty"><span class="h3">找不到该提交</span><a class="btn btn-outline" href="#/admin/reviews">返回队列</a></div></div>`;
  const left=rvLeft(),pos=left.findIndex(x=>x.id===it.id),done=RV.done[it.id];
  if(done)return `<div class="rvw"><div class="rvtop"><a class="crumb" style="margin:0" href="#/admin/reviews">${ic('back')}队列</a></div><div class="card empty"><span class="h3">已${done}</span>${left.length?`<a class="btn btn-primary" href="#/admin/reviews/${left[0].id}">审核下一条</a>`:'<a class="btn btn-outline" href="#/admin/reviews">返回队列</a>'}</div></div>`;
  const nx=left[(pos+1)%left.length],pv=left[(pos-1+left.length)%left.length];
  return `<div class="rvw"><div class="rvtop"><a class="crumb" style="margin:0" href="#/admin/reviews">${ic('back')}队列</a><span class="cap num">${pos+1} / ${left.length}</span><span class="ttl">${it.map} · ${it.diff}</span>${badge(RVK[it.kind][0],RVK[it.kind][1])}
    <span class="cap"><a href="#/admin/players/1" style="color:var(--text);font-weight:600">${it.player}</a> · ${it.time}</span><span class="sp"></span>
    <label class="row" style="gap:.5rem;font-size:.8125rem;color:var(--muted)">决定后自动进入下一条<button class="tog" role="switch" aria-checked="${RV.auto}" aria-label="决定后自动进入下一条" data-act="rvauto"></button></label>
    <a class="btn btn-outline btn-sm" href="#/admin/reviews/${pv.id}" aria-label="上一条">${ic('left')}<kbd>K</kbd></a><a class="btn btn-outline btn-sm" href="#/admin/reviews/${nx.id}" aria-label="下一条"><kbd>J</kbd>${ic('right')}</a></div>
   <div class="rvgrid"><section class="rvv ${RV.full?'full':''}" aria-label="提交截图"><div class="vbar"><button class="btn btn-outline btn-sm" data-act="vfit">适应 <kbd>0</kbd></button><button class="btn btn-outline btn-sm" data-act="v100">100% <kbd>1</kbd></button><button class="btn btn-outline btn-sm" data-act="vz" data-d="-1" aria-label="缩小">−</button><button class="btn btn-outline btn-sm" data-act="vz" data-d="1" aria-label="放大">＋</button><button class="btn btn-outline btn-sm" data-act="vfull">${RV.full?'退出全屏':'全屏'} <kbd>F</kbd></button><span class="vz num" id="vz">100%</span></div>
    <div class="viewer" id="viewer" tabindex="0" aria-label="截图查看器：滚轮缩放，拖动平移，双击切换适应与原始大小"><div class="vin" id="vin">${rvShot(it)}<div class="hl" id="hl"></div></div></div>
    ${RV.full?'':'<p class="cap">滚轮缩放 · 拖动平移 · 双击切换适应 / 原始大小</p>'}</section>
   <div class="rail">${rvDecision(it)}${rvFieldsCard(it)}
    <details class="rvcard rvmore" ${RV.more?'open':''}><summary data-act="rvmore">更多${ic('down')}</summary><div class="rvbody"><div class="row"><button class="btn btn-outline btn-sm" data-act="toast" data-m="已重新发送 OCRKit 请求">${ic('refresh')}重新发送 OCRKit 请求</button></div>
     <div class="row"><span class="lbl">识别准确性</span><button class="btn btn-outline btn-sm" data-act="toast" data-m="已标记：准确">准确</button><button class="btn btn-outline btn-sm" data-act="toast" data-m="已标记：有误">有误</button></div>
     <dl class="kv"><dt>提交编号</dt><dd class="num">SUB-${String(10240+it.id)}</dd><dt>提交时间</dt><dd>${it.time}</dd><dt>OCR 处理尝试</dt><dd>1</dd></dl></div></details></div></div></div>`;
}

/* ---------- viewer ---------- */
function vbox(){const v=document.getElementById('viewer');return v?{v,w:v.clientWidth,h:v.clientHeight}:null}
function vFit(){const b=vbox();if(!b)return;const k=Math.min(b.w/1920,b.h/1080);VW.k=k;VW.x=(b.w-1920*k)/2;VW.y=(b.h-1080*k)/2;VW.fit=true}
function vApply(){const el=document.getElementById('vin');if(!el)return;el.style.transform=`translate(${VW.x}px,${VW.y}px) scale(${VW.k})`;const z=document.getElementById('vz');if(z)z.textContent=Math.round(VW.k*100)+'%'}
function vZoomAt(f,mx,my){const b=vbox();if(!b)return;const min=Math.min(b.w/1920,b.h/1080)*.9,k=Math.max(min,Math.min(5,VW.k*f));mx=mx??b.w/2;my=my??b.h/2;VW.x=mx-(mx-VW.x)*k/VW.k;VW.y=my-(my-VW.y)*k/VW.k;VW.k=k;VW.fit=false;vApply()}
function vTo(r){const b=vbox();if(!b)return;const [x,y,w,h]=r,k=Math.min(b.w/(w*1.8),b.h/(h*1.8),3.5);VW.k=k;VW.x=b.w/2-(x+w/2)*k;VW.y=b.h/2-(y+h/2)*k;VW.fit=false;vApply()}
function rvAfterRender(){if(!document.getElementById('viewer'))return;if(VW.fit||!RV.keep)vFit();RV.keep=false;const vi=document.getElementById('vin');vi.style.transition='none';vApply();vi.offsetWidth;vi.style.transition='';
  const a=document.querySelector('[data-rvadd]');if(a&&RV.focus==='add'){a.focus();a.setSelectionRange(a.value.length,a.value.length)}
  const e=document.querySelector('[data-rvedit]');if(e&&RV.focus==='edit'){e.focus();e.select()}
  const n=document.querySelector('[data-rvnote]');if(n&&RV.focus==='note')n.focus();RV.focus=''}

/* ---------- actions ---------- */
const rvCur=()=>{const m=S.route.match(/^\/admin\/reviews\/(\d+)/);return m?RVITEMS.find(i=>i.id==m[1]):null};
function rvNext(id,label){
  RV.done[id]=label;RV.pend='';RV.edit='';RV.add='';VW.fit=true;
  S.toast=`已${label}`;clearTimeout(flash.t);flash.t=setTimeout(()=>{S.toast='';render()},1800);
  const left=rvLeft();
  if(RV.auto)location.hash=left.length?`#/admin/reviews/${left[0].id}`:'#/admin/reviews';
}
function rvAct(act,el,e){
  const d=el.dataset,it=rvCur(),R=true,X=false;
  switch(act){
   case 'rvf':RV.filter=d.v;return{render:R};
   case 'rvreset':RV.done={};RV.st={};return{render:R};
   case 'rvauto':RV.auto=!RV.auto;return{render:R};
   case 'rvmore':RV.more=!el.parentElement.open;return{render:X};
   case 'rvcand':{const s=rvSt(it.id),i=+d.i;s.confirmed=s.confirmed.includes(i)?[]:[i];RV.keep=true;return{render:R}}
   case 'rvaddc':{rvSt(it.id).added.push(+d.i);RV.add='';RV.keep=true;return{render:R}}
   case 'rvok':if(!rvApprovable(it))return{render:X};rvNext(it.id,'通过');return{render:R};
   case 'rvspot':rvNext(it.id,'确认抽检');return{render:R};
   case 'rvpend':RV.pend=d.v;RV.focus='note';RV.keep=true;return{render:R};
   case 'rvno':RV.pend='';RV.keep=true;return{render:R};
   case 'rvyes':rvNext(it.id,{resub:'要求重新提交',reject:'驳回',revoke:'撤销称号'}[RV.pend]);return{render:R};
   case 'rvedit':RV.edit=d.k;RV.focus='edit';RV.keep=true;e.stopPropagation();return{render:R};
   case 'rvsave':{const inp=document.querySelector(`[data-rvedit="${d.k}"]`);rvSt(it.id).corr[d.k]=inp.value;RV.edit='';RV.keep=true;return{render:R}}
   case 'rvfok':rvSt(it.id).ok[d.k]=true;RV.keep=true;e.stopPropagation();return{render:R};
   case 'rvzoom':if(e.target.closest('button'))return{render:X};vTo(d.r.split(',').map(Number));return{render:X};
   case 'vfit':vFit();vApply();return{render:X};
   case 'v100':{const b=vbox();VW.k=1;VW.x=(b.w-1920)/2;VW.y=(b.h-1080)/2;VW.fit=false;vApply();return{render:X}}
   case 'vz':vZoomAt(d.d==='1'?1.3:1/1.3);return{render:X};
   case 'vfull':RV.full=!RV.full;VW.fit=true;return{render:R};
  }
  return null;
}
/* viewer pointer/wheel interaction: direct DOM updates, no re-render */
document.addEventListener('wheel',e=>{const v=e.target.closest&&e.target.closest('#viewer');if(!v)return;e.preventDefault();const r=v.getBoundingClientRect();vZoomAt(Math.exp(-e.deltaY*.0016),e.clientX-r.left,e.clientY-r.top)},{passive:false});
document.addEventListener('pointerdown',e=>{const v=e.target.closest&&e.target.closest('#viewer');if(!v)return;VW.drag={x:e.clientX,y:e.clientY,ox:VW.x,oy:VW.y};v.classList.add('drag');v.setPointerCapture(e.pointerId)});
document.addEventListener('pointermove',e=>{if(!VW.drag)return;VW.x=VW.drag.ox+e.clientX-VW.drag.x;VW.y=VW.drag.oy+e.clientY-VW.drag.y;VW.fit=false;vApply()});
document.addEventListener('pointerup',()=>{if(!VW.drag)return;VW.drag=null;const v=document.getElementById('viewer');v&&v.classList.remove('drag')});
document.addEventListener('dblclick',e=>{if(!(e.target.closest&&e.target.closest('#viewer')))return;if(VW.fit){const b=vbox(),r=b.v.getBoundingClientRect();vZoomAt(1/VW.k,e.clientX-r.left,e.clientY-r.top)}else{vFit();vApply()}});
document.addEventListener('mouseover',e=>{const f=e.target.closest&&e.target.closest('.fld[data-r]');const h=document.getElementById('hl');if(!h)return;if(!f){h.style.display='none';return}const [x,y,w,ht]=f.dataset.r.split(',').map(Number);Object.assign(h.style,{display:'block',left:x+'px',top:y+'px',width:w+'px',height:ht+'px'})});
document.addEventListener('input',e=>{
  if(e.target.matches&&e.target.matches('[data-rvadd]')){RV.add=e.target.value;RV.focus='add';RV.keep=true;render()}
});
document.addEventListener('keydown',e=>{
  const it=rvCur();if(!it||RV.done[it.id])return;
  const t=e.target,typing=t.matches&&t.matches('input,textarea,select');
  if(typing){
    if(t.matches('[data-rvedit]')){if(e.key==='Enter'){rvSt(it.id).corr[t.dataset.rvedit]=t.value;RV.edit='';RV.keep=true;render()}if(e.key==='Escape'){RV.edit='';RV.keep=true;render()}}
    if(t.matches('[data-rvnote]')){if(e.key==='Enter'){rvAct('rvyes',{dataset:{}},e);render()}if(e.key==='Escape'){RV.pend='';RV.keep=true;render()}}
    return;
  }
  if(e.metaKey||e.ctrlKey||e.altKey)return;
  const k=e.key.toLowerCase(),go=(a,d={})=>{e.preventDefault();const r=rvAct(a,{dataset:d,parentElement:{}},e);if(r&&r.render)render()};
  if(RV.pend){if(k==='enter')go('rvyes');if(k==='escape')go('rvno');return}
  if(k==='a')it.kind==='spot'?go('rvspot'):go('rvok');
  else if(k==='r'&&it.kind!=='spot')go('rvpend',{v:'resub'});
  else if(k==='x')go('rvpend',{v:it.kind==='spot'?'revoke':'reject'});
  else if(k==='j'||k==='arrowright'){const l=rvLeft(),i=l.findIndex(x=>x.id===it.id);e.preventDefault();location.hash='#/admin/reviews/'+l[(i+1)%l.length].id}
  else if(k==='k'||k==='arrowleft'){const l=rvLeft(),i=l.findIndex(x=>x.id===it.id);e.preventDefault();location.hash='#/admin/reviews/'+l[(i-1+l.length)%l.length].id}
  else if(k==='f')go('vfull');else if(k==='0')go('vfit');else if(k==='1')go('v100');
  else if(k==='+'||k==='=')go('vz',{d:'1'});else if(k==='-')go('vz',{d:'-1'});
  else if(k==='escape'&&RV.full)go('vfull');
});
