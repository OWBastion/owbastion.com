<script setup lang="ts">
import { useSeoMeta } from "#imports";

type LoginState = "idle" | "pending" | "verified" | "expired" | "error";

const config = useRuntimeConfig();
const loginState = ref<LoginState>("idle");
const loginCode = ref("");
const loginEnvironment = ref<"production" | "test">();

let attemptId = "";
let attemptToken = "";
let pollTimer: ReturnType<typeof setTimeout> | undefined;

async function startLogin() {
  if (loginState.value === "pending") return;

  loginState.value = "pending";
  try {
    const response = await $fetch<{
      attemptId: string;
      attemptToken: string;
      code: string;
      expiresAt: number;
    }>(`${config.public.apiBaseUrl}/v1/auth/qq/login-attempt`, {
      method: "POST",
      body: { contractVersion: "1", provider: "qq" },
      credentials: "include",
    });

    attemptId = response.attemptId;
    attemptToken = response.attemptToken;
    loginCode.value = response.code;
    pollLogin();
  } catch {
    loginState.value = "error";
  }
}

async function pollLogin() {
  if (!attemptId) return;

  try {
    const response = await $fetch<{
      status: "pending" | "verified" | "expired";
      environment?: "production" | "test";
    }>(`${config.public.apiBaseUrl}/v1/auth/qq/login-attempt/${attemptId}`, {
      headers: { "x-login-attempt-token": attemptToken },
      credentials: "include",
    });

    loginState.value = response.status;
    loginEnvironment.value = response.environment;
    if (response.status === "pending") pollTimer = setTimeout(pollLogin, 2000);
  } catch {
    loginState.value = "error";
  }
}

onBeforeUnmount(() => {
  if (pollTimer) clearTimeout(pollTimer);
});

useSeoMeta({
  title: "躲避堡垒 3 · 玩家社区",
  description: "活动、成就记录和社区进度，全部整合在这里。",
});
</script>

<template>
  <main class="site-shell">
    <header class="site-header">
      <div class="nav-bar">
        <NuxtLink to="/" class="brand" aria-label="躲避堡垒 3 首页">
          <span class="brand-mark" aria-hidden="true">O</span>
          <span>躲避堡垒 3</span>
        </NuxtLink>

        <nav class="main-nav" aria-label="主导航">
          <a href="#events">事件</a>
          <a href="#achievements">成就</a>
          <a href="#rankings">天梯排名</a>
          <a href="#rotation">轮换挑战</a>
        </nav>

        <div class="auth-wrap">
          <button class="login-button" type="button" :aria-busy="loginState === 'pending'" @click="startLogin">
            {{ loginState === "pending" ? "验证中" : "登录" }} <span aria-hidden="true">↗</span>
          </button>
          <Transition name="auth-popover">
            <section v-if="loginState !== 'idle'" class="login-popover" aria-live="polite">
              <template v-if="loginState === 'pending'">
                <p class="popover-eyebrow">群内验证</p>
                <strong class="login-code">/验证 {{ loginCode }}</strong>
                <p>请在已开放的 QQ 群中 @机器人发送这条指令。验证完成后，本页面会自动登录。</p>
              </template>
              <template v-else-if="loginState === 'verified'">
                <p class="popover-eyebrow">已连接</p>
                <p>玩家身份已连接{{ loginEnvironment === "test" ? " · 测试环境" : "" }}。</p>
              </template>
              <template v-else-if="loginState === 'expired'">
                <p class="popover-eyebrow">验证码已过期</p>
                <p>重新点击登录即可获取新的验证码。</p>
              </template>
              <template v-else>
                <p class="popover-eyebrow">暂时无法登录</p>
                <p>验证服务暂不可用，请稍后重试。</p>
              </template>
            </section>
          </Transition>
        </div>
      </div>
    </header>

    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow">《躲避堡垒 3》社区</p>
        <h1 id="hero-title">躲避堡垒 3</h1>
        <p class="hero-topic">事件 · 成就 · 天梯排名</p>
        <p class="hero-description">现在活动、成就和社区进度已经整合，在这里了解规则、完成挑战，与社区其他玩家分享你的进度。</p>
      </div>

      <aside class="focus-panel" aria-labelledby="focus-title">
        <p class="panel-eyebrow">本期焦点</p>
        <h2 id="focus-title">即将到来<br />首个轮换挑战</h2>
        <p>限时成就目标、参与条件和公开完成记录。活动结束后，不再支持该活动的提交。</p>
        <ul>
          <li>限时成就挑战</li>
          <li>限时活动</li>
          <li>公开完成记录</li>
        </ul>
      </aside>
    </section>

    <section id="rotation" class="rotation-feature" aria-labelledby="rotation-title">
      <div class="feature-copy">
        <p class="eyebrow">轮换挑战</p>
        <h2 id="rotation-title">每段时间<br />都有值得完成的挑战</h2>
        <p>轮换挑战会在当前开放时间内提供限时成就挑战。</p>
      </div>
      <div class="feature-detail">
        <p>首个轮换挑战正在准备。</p>
        <span>开放后，这里会说明限时条件和提交窗口。</span>
      </div>
    </section>

    <section class="content-section" aria-labelledby="content-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">为《躲避堡垒 3》玩家准备的内容</p>
          <h2 id="content-title">每一次游玩<br />都值得留下记录</h2>
        </div>
        <p>仅展示公开内容。玩家数据、审核证据和未发布草稿不会在这里出现。</p>
      </div>

      <div class="content-grid">
        <article id="events" class="content-card content-card-wide">
          <p class="card-label">事件</p>
          <h3>会改变游玩体验的随机事件。</h3>
          <p>随机事件会改变一局《躲避堡垒 3》，这里记录它们在已发布内容中的变化。</p>
        </article>
        <article id="achievements" class="content-card">
          <p class="card-label">成就</p>
          <h3>完成过的挑战</h3>
          <p>记录玩家完成的目标与公开进度。</p>
        </article>
        <article id="rankings" class="content-card content-card-emphasis">
          <p class="card-label">天梯排名</p>
          <h3>每条公开记录都有上下文</h3>
          <p>挑战、完成时间和玩家位置，构成可理解的竞争记录。</p>
        </article>
        <article class="content-card">
          <p class="card-label">版本记录</p>
          <h3>已发布变化都有记录</h3>
          <p>以 released snapshot 为依据，追踪《躲避堡垒 3》的内容与规则演进。</p>
        </article>
      </div>
    </section>

    <footer class="footer">
      <span>躲避堡垒 3 社区</span>
      <span>活动 · 成就 · 天梯排名</span>
      <span>© {{ new Date().getFullYear() }} 躲避堡垒 3</span>
    </footer>
  </main>
</template>

<style>
:root {
  --page: oklch(16% 0.012 160);
  --surface: oklch(20% 0.014 160);
  --surface-strong: oklch(25% 0.04 155);
  --text: oklch(93% 0.01 100);
  --muted: oklch(69% 0.016 150);
  --quiet: oklch(51% 0.014 150);
  --line: oklch(92% 0.01 100 / 13%);
  --line-strong: oklch(92% 0.01 100 / 21%);
  --accent: oklch(74% 0.11 145);
  --accent-surface: oklch(30% 0.065 150);
  --font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Noto Sans CJK SC", "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html { background: var(--page); scroll-behavior: smooth; }
body { min-width: 320px; margin: 0; color: var(--text); background: var(--page); font-family: var(--font-ui); font-synthesis: none; }
button { font: inherit; }
a { color: inherit; }

.site-shell { min-height: 100svh; padding: 18px clamp(18px, 5vw, 76px) 30px; }
.site-header { position: sticky; z-index: 10; top: 14px; max-width: 1280px; margin: 0 auto; }
.nav-bar { display: flex; align-items: center; gap: 28px; min-height: 54px; padding: 0 16px 0 12px; border: 1px solid var(--line); border-radius: 14px; background: oklch(18% 0.013 160 / 82%); box-shadow: 0 8px 22px -18px oklch(0% 0 0 / 80%); backdrop-filter: blur(18px) saturate(135%); }
.brand { display: inline-flex; align-items: center; gap: 9px; font-size: .9rem; font-weight: 650; letter-spacing: -.025em; text-decoration: none; white-space: nowrap; }
.brand-mark { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; color: oklch(22% 0.025 155); background: var(--accent); font-size: .92rem; font-weight: 760; }
.main-nav { display: flex; align-items: center; justify-content: center; gap: clamp(16px, 2.6vw, 34px); flex: 1; color: var(--muted); font-size: .78rem; }
.main-nav a { text-decoration: none; transition: color 160ms ease; }
.main-nav a:hover, .main-nav a:focus-visible { color: var(--text); }
.auth-wrap { position: relative; }
.login-button { min-height: 34px; padding: 0 11px; border: 1px solid var(--line); border-radius: 9px; color: var(--text); background: oklch(27% 0.016 160); cursor: pointer; font-size: .78rem; font-weight: 600; transition: background 160ms ease, transform 100ms ease; }
.login-button:hover { background: oklch(32% 0.02 160); }
.login-button:active { transform: scale(.97); }
.login-button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

.login-popover { position: absolute; top: calc(100% + 10px); right: 0; width: min(350px, calc(100vw - 36px)); padding: 17px; border: 1px solid var(--line-strong); border-radius: 13px; color: var(--text); background: oklch(21% 0.015 160 / 94%); box-shadow: 0 18px 32px -26px oklch(0% 0 0 / 85%); backdrop-filter: blur(20px) saturate(145%); transform-origin: top right; }
.login-popover p { margin: 0; color: var(--muted); font-size: .8rem; line-height: 1.55; }
.popover-eyebrow { margin-bottom: 8px !important; color: var(--accent) !important; font-size: .68rem !important; font-weight: 700; letter-spacing: .06em; }
.login-code { display: block; margin-bottom: 8px; color: var(--text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.22rem; letter-spacing: .04em; }
.auth-popover-enter-active, .auth-popover-leave-active { transition: opacity 180ms ease, transform 220ms cubic-bezier(.16, 1, .3, 1); }
.auth-popover-enter-from, .auth-popover-leave-to { opacity: 0; transform: translateY(-5px) scale(.98); }

.hero { display: grid; grid-template-columns: minmax(0, 1.18fr) minmax(320px, .72fr); align-items: center; gap: clamp(40px, 8vw, 120px); max-width: 1100px; min-height: 610px; margin: 0 auto; padding: clamp(90px, 14vh, 160px) 0 clamp(80px, 12vh, 130px); }
.eyebrow { margin: 0 0 17px; color: var(--accent); font-size: .72rem; font-weight: 700; letter-spacing: .04em; }
h1, h2, h3, p { margin-top: 0; }
h1, h2, h3 { color: var(--text); font-weight: 650; letter-spacing: -.052em; }
h1 { margin-bottom: 10px; font-size: clamp(3.6rem, 8.1vw, 7.2rem); line-height: .94; }
.hero-topic { margin-bottom: 27px; color: var(--text); font-size: clamp(1.65rem, 3vw, 2.75rem); font-weight: 400; letter-spacing: -.045em; line-height: 1.05; }
.hero-description { max-width: 45ch; margin-bottom: 0; color: var(--muted); font-size: clamp(1rem, 1.25vw, 1.1rem); line-height: 1.65; }

.focus-panel { align-self: center; padding: clamp(24px, 3.2vw, 34px); border: 1px solid color-mix(in oklch, var(--accent) 44%, var(--line)); border-radius: 18px; background: var(--accent-surface); }
.panel-eyebrow, .card-label { margin-bottom: 28px; color: color-mix(in oklch, var(--accent) 82%, white); font-size: .72rem; font-weight: 700; letter-spacing: .05em; }
.focus-panel h2 { max-width: 10ch; margin-bottom: 18px; font-size: clamp(1.85rem, 3vw, 2.65rem); line-height: 1.05; }
.focus-panel > p:not(.panel-eyebrow) { margin-bottom: 25px; color: oklch(89% 0.02 145); font-size: .9rem; line-height: 1.65; }
.focus-panel ul { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; color: oklch(87% 0.016 145); font-size: .8rem; }
.focus-panel li { display: flex; align-items: center; gap: 9px; }
.focus-panel li::before { width: 4px; height: 4px; border-radius: 50%; background: var(--accent); content: ""; }

.rotation-feature { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(230px, .65fr); gap: 38px; max-width: 1100px; margin: 0 auto clamp(120px, 17vw, 210px); padding: clamp(30px, 5vw, 56px); border: 1px solid var(--line-strong); border-radius: 18px; background: var(--surface); }
.feature-copy h2, .section-heading h2 { margin-bottom: 18px; font-size: clamp(2.2rem, 4.4vw, 4.4rem); line-height: .98; }
.feature-copy > p:last-child, .feature-detail { color: var(--muted); font-size: .9rem; line-height: 1.65; }
.feature-detail { align-self: end; padding-left: 22px; border-left: 1px solid var(--line-strong); }
.feature-detail p { margin-bottom: 8px; color: var(--text); font-weight: 600; }
.feature-detail span { color: var(--quiet); }

.content-section { max-width: 1100px; margin: 0 auto clamp(120px, 17vw, 210px); }
.section-heading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(230px, .65fr); align-items: end; gap: 40px; margin-bottom: 46px; }
.section-heading > p { max-width: 32ch; margin-bottom: 5px; color: var(--muted); font-size: .9rem; line-height: 1.65; }
.content-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.content-card { min-height: 250px; padding: 26px; border: 1px solid var(--line); border-radius: 16px; background: var(--surface); }
.content-card-wide { grid-column: span 2; min-height: 230px; }
.content-card-emphasis { background: oklch(23% 0.032 155); }
.card-label { margin-bottom: 66px; color: var(--accent); }
.content-card h3 { max-width: 18ch; margin-bottom: 11px; font-size: clamp(1.35rem, 2.4vw, 2rem); line-height: 1.12; }
.content-card p:last-child { max-width: 42ch; margin-bottom: 0; color: var(--muted); font-size: .85rem; line-height: 1.62; }

.footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; max-width: 1280px; margin: 0 auto; padding-top: 25px; border-top: 1px solid var(--line); color: var(--quiet); font-size: .66rem; letter-spacing: .07em; }

@media (max-width: 820px) { .hero, .rotation-feature, .section-heading { grid-template-columns: 1fr; } .hero { gap: 42px; min-height: auto; } .focus-panel { max-width: 520px; } .feature-detail { padding-top: 22px; padding-left: 0; border-top: 1px solid var(--line-strong); border-left: 0; } }
@media (max-width: 620px) { .site-shell { padding-inline: 14px; } .site-header { top: 8px; } .nav-bar { flex-wrap: wrap; gap: 12px; padding: 10px 12px; border-radius: 13px; } .main-nav { order: 3; width: 100%; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px solid var(--line); font-size: .72rem; } .hero { padding-top: 90px; } h1 { font-size: clamp(3.2rem, 16vw, 5rem); } .hero-topic { font-size: 1.65rem; } .rotation-feature { gap: 26px; padding: 25px; } .content-grid { grid-template-columns: 1fr; } .content-card-wide { grid-column: auto; } .content-card { min-height: 220px; } .footer { align-items: flex-start; flex-direction: column; gap: 9px; } }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; } }
@media (prefers-reduced-transparency: reduce) { .nav-bar, .login-popover { background: var(--surface); backdrop-filter: none; } }
@media (prefers-contrast: more) { .nav-bar, .focus-panel, .rotation-feature, .content-card { border-color: var(--text); } }
</style>
