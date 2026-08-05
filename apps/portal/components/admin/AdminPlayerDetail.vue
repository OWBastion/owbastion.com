<script setup lang="ts">
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { submissionStatusText, submissionStatusTone } from "~/utils/submissionStatus";

const props = defineProps<{ player: AdminPlayerDetail; loading?: boolean }>();
const emit = defineEmits<{ setStatus: [status: "active" | "banned"]; unbind: [bindingId: string]; grantCompleted: []; editIdentity: [] }>();

const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const battleTag = computed(() => `${props.player.playerName}#${props.player.playerId}`);
const initials = computed(() => props.player.playerName.slice(0, 2));
const statusLabel = computed(() => props.player.status === "active" ? "正常" : "已封禁");
const submissionStatusLabel = (status: string) => submissionStatusText[status] ?? status;
const submissionSummary = (submission: AdminPlayerDetail["recentSubmissions"][number]) => {
  const challenge = submission.challenge;
  if (!challenge) return { title: submission.mapName, meta: "" };
  if (challenge.family === "map") return { title: challenge.name, meta: challenge.difficulty ? `${challenge.mapName} · ${challenge.difficulty}` : challenge.mapName };
  return { title: challenge.titleName, meta: challenge.category };
};

const sections = [
  { id: "overview", label: "概览" },
  { id: "titles", label: "称号" },
  { id: "submissions", label: "最近提交" },
] as const;

const activeSection = shallowRef<(typeof sections)[number]["id"]>("overview");
let sectionObserver: IntersectionObserver | null = null;

function setActiveSection(id: (typeof sections)[number]["id"]) {
  activeSection.value = id;
}

const desktopLayoutQuery = "(min-width: 961px)";

onMounted(() => {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
  const ids = sections.map((section) => section.id);
  sectionObserver = new IntersectionObserver(
    (entries) => {
      const hideSubmissionsTab = window.matchMedia(desktopLayoutQuery).matches;
      const visible = entries
        .filter((entry) => {
          if (!entry.isIntersecting) return false;
          // Desktop: submissions live in the sticky aside; don't steal tab active state.
          if (hideSubmissionsTab && entry.target.id === "submissions") return false;
          return true;
        })
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      const top = visible[0];
      if (!top?.target?.id) return;
      const id = top.target.id as (typeof sections)[number]["id"];
      if (ids.includes(id)) activeSection.value = id;
    },
    { rootMargin: "-20% 0px -55% 0px", threshold: [0.15, 0.35, 0.55] },
  );
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) sectionObserver.observe(el);
  }
});

onBeforeUnmount(() => {
  sectionObserver?.disconnect();
  sectionObserver = null;
});
</script>

<template>
  <section class="player-detail" aria-label="玩家详情">
    <nav class="detail-tabs glass elevation-1 scroll-edge-sticky" aria-label="玩家详情分区">
      <a
        v-for="section in sections"
        :key="section.id"
        class="detail-tab"
        :class="{
          'detail-tab--active': activeSection === section.id,
          'detail-tab--mobile-only': section.id === 'submissions',
        }"
        :href="`#${section.id}`"
        @click="setActiveSection(section.id)"
      >
        {{ section.label }}
      </a>
    </nav>

    <div class="player-detail__layout">
      <div class="player-detail__primary">
        <section id="overview" class="identity-card" aria-labelledby="player-identity-title">
          <div class="identity-card__top">
            <div class="identity-card__main">
              <div class="identity-avatar" aria-hidden="true">{{ initials }}</div>
              <div class="identity-card__copy">
                <p class="eyebrow">平台玩家</p>
                <div class="identity-card__title-row">
                  <h2 id="player-identity-title">{{ battleTag }}</h2>
                  <UButton
                    class="identity-edit-btn"
                    icon="i-lucide-pencil"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    square
                    aria-label="编辑战网 ID"
                    :disabled="props.loading"
                    @click="emit('editIdentity')"
                  />
                  <StatusBadge :label="statusLabel" :tone="props.player.status === 'active' ? 'success' : 'warning'" />
                </div>
                <p class="identity-card__id">账号 ID · {{ props.player.playerAccountId }}</p>
              </div>
            </div>
            <div class="identity-card__actions">
              <UButton
                :label="props.player.status === 'active' ? '封禁玩家' : '解除封禁'"
                :color="props.player.status === 'active' ? 'error' : 'primary'"
                :loading="props.loading"
                @click="emit('setStatus', props.player.status === 'active' ? 'banned' : 'active')"
              />
            </div>
          </div>

          <div class="identity-card__metrics" aria-label="玩家概览">
            <div><span>有效称号</span><strong>{{ props.player.titleGrants.length }}</strong></div>
            <div><span>最近提交</span><strong>{{ props.player.recentSubmissions.length }}</strong></div>
            <div><span>QQ 绑定</span><strong>{{ props.player.bindings.length }}</strong></div>
            <div><span>最近更新</span><strong>{{ formatTime(props.player.updatedAt) }}</strong></div>
          </div>

          <div class="identity-card__meta">
            <dl class="info-grid">
              <div>
                <dt>玩家 ID</dt>
                <dd>{{ props.player.playerId }}</dd>
              </div>
              <div>
                <dt>最近更新</dt>
                <dd>{{ formatTime(props.player.updatedAt) }}</dd>
              </div>
              <div class="info-grid__wide">
                <dt>平台账号 ID</dt>
                <dd class="mono">{{ props.player.playerAccountId }}</dd>
              </div>
            </dl>

            <div class="bindings-inline" aria-labelledby="bindings-title">
              <div class="bindings-inline__heading">
                <h3 id="bindings-title">QQ 绑定</h3>
                <UBadge :label="`${props.player.bindings.length}`" color="neutral" variant="subtle" size="sm" />
              </div>
              <div v-if="props.player.bindings.length" class="player-binding-list">
                <div v-for="binding in props.player.bindings" :key="binding.bindingId" class="player-binding-list__item">
                  <div class="player-binding-list__copy">
                    <strong>{{ binding.groupOpenId }}</strong>
                    <small>{{ binding.memberOpenId }}</small>
                  </div>
                  <UButton label="解绑" color="neutral" variant="link" size="sm" :disabled="props.loading" @click="emit('unbind', binding.bindingId)" />
                </div>
              </div>
              <p v-else class="bindings-inline__empty">暂无 QQ 绑定</p>
            </div>
          </div>
        </section>

        <AdminPlayerTitles
          id="titles"
          class="detail-card"
          :player-account-id="props.player.playerAccountId"
          :title-grants="props.player.titleGrants"
          :loading="props.loading"
          @granted="emit('grantCompleted')"
          @revoked="emit('grantCompleted')"
        />
      </div>

      <aside id="submissions" class="detail-card detail-card--activity" aria-labelledby="submissions-title">
        <div class="detail-card__heading">
          <div>
            <p class="card-kicker">Activity</p>
            <h3 id="submissions-title">最近提交</h3>
          </div>
          <UBadge :label="`${props.player.recentSubmissions.length} 条`" color="neutral" variant="subtle" />
        </div>
        <div v-if="props.player.recentSubmissions.length" class="submission-list">
          <NuxtLink
            v-for="submission in props.player.recentSubmissions"
            :key="submission.submissionId"
            :to="`/admin/reviews/${submission.submissionId}`"
            class="submission-row"
          >
            <div class="submission-row__map">
              <strong>{{ submissionSummary(submission).title }}</strong>
              <small v-if="submissionSummary(submission).meta">{{ submissionSummary(submission).meta }}</small>
            </div>
            <StatusBadge :label="submissionStatusLabel(submission.status)" :tone="submissionStatusTone(submission.status)" />
            <time :datetime="new Date(submission.updatedAt).toISOString()">{{ formatTime(submission.updatedAt) }}</time>
          </NuxtLink>
        </div>
        <UEmpty v-else title="暂无提交记录" variant="naked" />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.player-detail {
  display: grid;
  gap: 16px;
  scroll-behavior: smooth;
}

.player-detail__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
  align-items: start;
  gap: 16px;
}

.player-detail__primary {
  display: grid;
  min-width: 0;
  gap: 16px;
}

/* Single-row segment control — matches grants-tabs craft */
.detail-tabs {
  position: sticky;
  z-index: 3;
  top: 12px;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  padding: 5px;
  overflow-x: auto;
  border: 1px solid color-mix(in oklch, var(--line) 55%, transparent);
  border-radius: 12px;
}

.detail-tab {
  flex: 0 0 auto;
  padding: 8px 14px;
  border-radius: 8px;
  color: var(--text-on-glass-secondary);
  font-size: var(--type-caption-size);
  font-weight: 650;
  line-height: 1.2;
  text-decoration: none;
  white-space: nowrap;
  transition: color 160ms ease, background 160ms ease, transform 100ms ease;
}

.detail-tab:hover,
.detail-tab:focus-visible {
  color: var(--text-on-glass);
  background: color-mix(in oklch, var(--surface) 72%, transparent);
}

.detail-tab--active {
  color: var(--on-accent);
  background: var(--accent);
}

.detail-tab:active {
  transform: scale(var(--press-scale));
}

/* Submissions sit in the desktop aside — no need for a nav tab there */
.detail-tab--mobile-only {
  display: none;
}

.identity-card,
.detail-card {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--elevation-2);
}

.identity-card {
  display: grid;
  gap: 0;
  min-width: 0;
  padding: clamp(20px, 3vw, 28px);
  scroll-margin-top: 92px;
}

.identity-card__top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px 20px;
}

.identity-card__main {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 16px;
}

.identity-avatar {
  display: grid;
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  place-items: center;
  border: 1px solid color-mix(in oklch, var(--accent) 24%, var(--line));
  border-radius: 50%;
  color: var(--accent);
  background: var(--accent-surface);
  font-size: 1.2rem;
  font-weight: 750;
  letter-spacing: -0.08em;
}

.identity-card__copy {
  min-width: 0;
}

.identity-card__copy .eyebrow {
  margin-bottom: 5px;
}

.identity-card__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
}

.identity-card h2 {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: clamp(1.35rem, 2.8vw, 1.85rem);
  letter-spacing: -0.05em;
  line-height: 1.08;
}

.identity-edit-btn {
  flex: 0 0 auto;
  opacity: 0.72;
}

.identity-edit-btn:hover,
.identity-edit-btn:focus-visible {
  opacity: 1;
}

.identity-card__id {
  margin: 6px 0 0;
  overflow-wrap: anywhere;
  color: var(--quiet);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.72rem;
}

.identity-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.identity-card__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}

.identity-card__metrics div {
  display: grid;
  gap: 5px;
  padding-inline: 14px;
  border-right: 1px solid var(--line);
}

.identity-card__metrics div:first-child {
  padding-left: 0;
}

.identity-card__metrics div:last-child {
  padding-right: 0;
  border-right: 0;
}

.identity-card__metrics span,
.card-kicker {
  color: var(--quiet);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.identity-card__metrics strong {
  font-size: 0.86rem;
  font-weight: 680;
}

.identity-card__meta {
  display: grid;
  gap: 18px;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 20px;
  margin: 0;
}

.info-grid div {
  min-width: 0;
}

.info-grid__wide {
  grid-column: 1 / -1;
}

.info-grid dt {
  color: var(--quiet);
  font-size: 0.72rem;
}

.info-grid dd {
  margin: 5px 0 0;
  overflow-wrap: anywhere;
  font-size: 0.86rem;
  font-weight: 650;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.76rem !important;
}

/* Secondary connection block — not a competing card */
.bindings-inline {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid color-mix(in oklch, var(--line) 70%, transparent);
  border-radius: 12px;
  background: color-mix(in oklch, var(--surface-raised) 42%, transparent);
}

.bindings-inline__heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bindings-inline__heading h3 {
  margin: 0;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.bindings-inline__empty {
  margin: 0;
  color: var(--quiet);
  font-size: 0.78rem;
}

.player-binding-list {
  display: grid;
  gap: 0;
}

.player-binding-list__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 8px 0;
  border-bottom: 1px solid color-mix(in oklch, var(--line) 70%, transparent);
}

.player-binding-list__item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.player-binding-list__copy {
  min-width: 0;
}

.player-binding-list strong,
.player-binding-list small {
  display: block;
  overflow-wrap: anywhere;
}

.player-binding-list strong {
  font-size: 0.8rem;
}

.player-binding-list small {
  margin-top: 3px;
  color: var(--quiet);
  font-size: 0.7rem;
}

.detail-card {
  min-width: 0;
  padding: clamp(18px, 2.4vw, 24px);
  scroll-margin-top: 92px;
}

.detail-card--activity {
  display: grid;
  align-content: start;
  gap: 14px;
  position: sticky;
  top: 72px;
}

.detail-card__heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}

.card-kicker {
  margin: 0 0 5px;
}

.detail-card__heading h3 {
  margin: 0;
  font-size: 1.08rem;
  letter-spacing: -0.025em;
}

.submission-list {
  display: grid;
  gap: 4px;
  margin: 0;
}

.submission-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  margin-inline: -10px;
  padding: 11px 10px;
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
  transition: background 160ms ease;
}

.submission-row:hover,
.submission-row:focus-visible {
  background: color-mix(in oklch, var(--surface-raised) 55%, transparent);
}

.submission-row__map {
  flex: 1 1 auto;
  min-width: 0;
}

.submission-row strong,
.submission-row small {
  display: block;
  overflow-wrap: anywhere;
}

.submission-row strong {
  font-size: 0.84rem;
}

.submission-row small,
.submission-row time {
  margin-top: 4px;
  color: var(--quiet);
  font-size: 0.72rem;
}

.submission-row time {
  flex: 0 0 auto;
  margin-top: 0;
}

.submission-row :deep(.status-badge) {
  flex: 0 0 auto;
}

@media (max-width: 960px) {
  .player-detail__layout {
    grid-template-columns: 1fr;
  }

  .detail-card--activity {
    position: static;
    order: 2;
  }

  .player-detail__primary {
    order: 1;
  }

  .detail-tab--mobile-only {
    display: inline-flex;
  }
}

@media (max-width: 640px) {
  .identity-card__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 0;
  }

  .identity-card__metrics div:nth-child(2) {
    border-right: 0;
  }

  .identity-card__metrics div:nth-child(3) {
    padding-left: 0;
  }

  .identity-card__metrics div:nth-child(-n + 2) {
    padding-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }

  .identity-card__metrics div:nth-child(4) {
    padding-right: 0;
  }

  .info-grid {
    grid-template-columns: 1fr;
  }

  .info-grid__wide {
    grid-column: auto;
  }

  .detail-tabs {
    position: static;
    width: 100%;
  }

  .submission-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .submission-row time {
    width: 100%;
    margin-top: -2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .player-detail {
    scroll-behavior: auto;
  }

  .detail-tab {
    transition: color 160ms ease, background 160ms ease;
  }

  .detail-tab:active {
    transform: none;
  }
}

@media (prefers-contrast: more) {
  .detail-tabs,
  .identity-card,
  .detail-card,
  .bindings-inline {
    border-color: var(--line-strong);
  }
}
</style>
