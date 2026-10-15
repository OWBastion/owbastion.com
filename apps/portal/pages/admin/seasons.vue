<script setup lang="ts">
import type { AdminSeason, AdminSeasonListResponse, AdminSeasonWriteRequest, SeasonPhase } from "@owbastion/contracts";
import { portalErrorDetails } from "~/utils/portal-error";
import { createRequestId } from "~/utils/request-id";
import {
  daysLeft,
  formatSeasonDate,
  formatSeasonShortDate,
  seasonAlerts,
  seasonDateFromInput,
  seasonDateInput,
  seasonErrorMessages,
  seasonOverview,
  seasonPhaseLabel,
  seasonTimeline,
  seasonWeeks,
  seasonWriteIssue,
} from "~/utils/season";

definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "赛季 · 躲避堡垒 3" });

type SeasonPayload = Omit<AdminSeasonWriteRequest, "contractVersion">;
type SeasonFilter = "all" | SeasonPhase;

const DAY = 86_400_000;
const filterOptions: Array<{ key: SeasonFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "running", label: "进行中" },
  { key: "scheduled", label: "已排期" },
  { key: "draft", label: "草稿" },
  { key: "ended", label: "已结束" },
];
const ordinals = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

const api = useAdminApi();
const toast = useToast();
const seasons = shallowRef<AdminSeason[]>([]);
const serverNow = shallowRef(Date.now());
const filter = shallowRef<SeasonFilter>("all");
const errorMessage = shallowRef("");
const saving = shallowRef(false);
const editorOpen = shallowRef(false);
const editing = shallowRef<AdminSeason | null>(null);
const confirmEnd = shallowRef(false);
const form = reactive({ name: "", startDate: "", endDate: "", public: false });

const adminData = useAdminAsyncData("seasons", () => api<AdminSeasonListResponse>("/v1/seasons"), {
  onStart: () => { errorMessage.value = ""; },
  onData: (response) => { seasons.value = response.items; serverNow.value = response.now; },
  onError: (error) => { errorMessage.value = portalErrorDetails(error, "无法读取赛季。").description; },
});

const overview = computed(() => seasonOverview(seasons.value, serverNow.value));
const alerts = computed(() => seasonAlerts(seasons.value, serverNow.value));
const timeline = computed(() => seasonTimeline(seasons.value, serverNow.value));
const counts = computed(() => {
  const result: Record<string, number> = { all: seasons.value.length };
  for (const season of seasons.value) result[season.phase] = (result[season.phase] ?? 0) + 1;
  return result;
});
const visibleFilters = computed(() => filterOptions.filter((option) => option.key === "all" || counts.value[option.key]));
const rows = computed(() => seasons.value.filter((season) => filter.value === "all" || season.phase === filter.value));

const startLocked = computed(() => editing.value?.phase === "running");
// An untouched date keeps the stored instant: an early-ended Season closes mid-day, not at end of day.
const draftWindow = computed(() => ({
  name: form.name,
  startsAt: editing.value && form.startDate === seasonDateInput(editing.value.startsAt) ? editing.value.startsAt : seasonDateFromInput(form.startDate),
  endsAt: editing.value && form.endDate === seasonDateInput(editing.value.endsAt) ? editing.value.endsAt : seasonDateFromInput(form.endDate, true),
}));
const formIssue = computed(() => form.startDate && form.endDate ? seasonWriteIssue(draftWindow.value, seasons.value.filter((season) => season.seasonId !== editing.value?.seasonId)) : "需要选择开始和结束日期");
const publishLabel = computed(() => form.startDate && draftWindow.value.startsAt > serverNow.value ? "发布并排期" : "发布并开始");

const payloadOf = (season: AdminSeason, overrides: Partial<SeasonPayload> = {}): SeasonPayload => ({
  name: season.name, startsAt: season.startsAt, endsAt: season.endsAt, status: season.status, public: season.public, ...overrides,
});
const failure = (error: unknown, fallback: string) => {
  const details = portalErrorDetails(error, fallback);
  return (details.code && seasonErrorMessages[details.code]) || details.description;
};

function openEditor(season: AdminSeason | null) {
  editing.value = season;
  confirmEnd.value = false;
  errorMessage.value = "";
  if (season) {
    Object.assign(form, { name: season.name, startDate: seasonDateInput(season.startsAt), endDate: seasonDateInput(season.endsAt), public: season.public });
  } else {
    const last = [...seasons.value].sort((a, b) => b.endsAt - a.endsAt)[0];
    const start = Math.max(last ? last.endsAt + 1 : serverNow.value, serverNow.value);
    Object.assign(form, { name: `第${ordinals[seasons.value.length] ?? seasons.value.length + 1}赛季`, startDate: seasonDateInput(start), endDate: seasonDateInput(start + 13 * 7 * DAY), public: false });
  }
  editorOpen.value = true;
}

const putSeason = (seasonId: string, payload: SeasonPayload) =>
  api<AdminSeason>(`/v1/seasons/${seasonId}`, { method: "PUT", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", ...payload } });

async function undoTo(seasonId: string, payload: SeasonPayload) {
  try {
    await putSeason(seasonId, payload);
    await adminData.refresh();
  } catch (error) {
    errorMessage.value = failure(error, "无法撤销。");
  }
}

async function save(mode: "draft" | "publish" | "keep") {
  if (formIssue.value) return;
  const previous = editing.value;
  const { startsAt, endsAt } = draftWindow.value;
  // Extending an early-ended Season past now reopens it.
  const status = mode === "publish" ? "active" : mode === "keep" && previous ? (previous.status === "archived" && endsAt > serverNow.value ? "active" : previous.status) : "draft";
  const payload: SeasonPayload = { name: form.name.trim(), startsAt, endsAt, status, public: form.public };
  saving.value = true;
  errorMessage.value = "";
  try {
    const saved = previous
      ? await putSeason(previous.seasonId, payload)
      : await api<AdminSeason>("/v1/seasons", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: { contractVersion: "1", ...payload } });
    editorOpen.value = false;
    const title = mode === "publish"
      ? `${saved.name}已发布，${saved.phase === "scheduled" ? `${formatSeasonShortDate(saved.startsAt)} 自动开始` : "现在开始"}${saved.public ? "" : "（目前对玩家隐藏）"}`
      : `${saved.name}已保存`;
    toast.add({ title, color: "success", duration: 8000, ...(previous ? { actions: [{ label: "撤销", color: "neutral" as const, variant: "outline" as const, onClick: () => { void undoTo(previous.seasonId, payloadOf(previous)); } }] } : {}) });
    await adminData.refresh();
  } catch (error) {
    errorMessage.value = failure(error, "无法保存赛季。");
  } finally {
    saving.value = false;
  }
}

async function toggleVisibility(season: AdminSeason) {
  errorMessage.value = "";
  try {
    const saved = await putSeason(season.seasonId, payloadOf(season, { public: !season.public }));
    toast.add({ title: `${saved.name}已${saved.public ? "对玩家显示" : "对玩家隐藏"}`, color: "neutral", duration: 8000, actions: [{ label: "撤销", color: "neutral", variant: "outline", onClick: () => { void undoTo(season.seasonId, payloadOf(season)); } }] });
    await adminData.refresh();
  } catch (error) {
    errorMessage.value = failure(error, "无法更新可见性。");
  }
}

async function endEarly() {
  const season = editing.value;
  if (!season) return;
  if (!confirmEnd.value) { confirmEnd.value = true; return; }
  saving.value = true;
  errorMessage.value = "";
  try {
    const ended = await api<AdminSeason>(`/v1/seasons/${season.seasonId}/end`, { method: "POST", headers: { "Idempotency-Key": createRequestId() } });
    editorOpen.value = false;
    toast.add({ title: `${ended.name}已提前结束`, description: "排名定格在现在。", color: "success" });
    await adminData.refresh();
  } catch (error) {
    confirmEnd.value = false;
    errorMessage.value = failure(error, "无法提前结束赛季。");
  } finally {
    saving.value = false;
  }
}

const badgeColor = (phase: SeasonPhase) => ({ running: "success", scheduled: "info", draft: "neutral", ended: "neutral" } as const)[phase];
const rangeText = (season: AdminSeason) => `${formatSeasonDate(season.startsAt)} – ${formatSeasonShortDate(season.endsAt)} · ${seasonWeeks(season)} 周`;
</script>

<template>
  <AdminWorkspace title="赛季" :count="adminData.loading.value ? '读取中…' : `${seasons.length} 个`">
    <template #actions><UButton class="pressable" label="新建赛季" icon="i-lucide-plus" @click="openEditor(null)" /></template>
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>

    <section class="strip surface-card" aria-label="赛季概况">
      <div class="facts">
        <div v-if="overview.running" class="fact">
          <strong>{{ overview.running.name }} · 还剩 {{ daysLeft(overview.running.endsAt, serverNow) }} 天</strong>
          <span>进行中，{{ formatSeasonShortDate(overview.running.endsAt) }} 结束</span>
        </div>
        <div v-if="overview.running" class="fact">
          <strong class="num">{{ overview.running.playerCount }} 名玩家</strong>
          <span>本赛季已上榜</span>
        </div>
        <div v-else class="fact">
          <strong>没有进行中的赛季</strong>
          <span>排行榜只显示全部时间</span>
        </div>
        <div class="fact">
          <template v-if="overview.upcoming">
            <strong>{{ overview.upcoming.name }} · {{ formatSeasonShortDate(overview.upcoming.startsAt) }} 开始</strong>
            <span>{{ seasonPhaseLabel[overview.upcoming.phase] }}{{ overview.upcoming.public ? "，玩家可见" : "，玩家不可见" }}</span>
          </template>
          <template v-else><strong>没有下一个赛季</strong><span>—</span></template>
        </div>
      </div>
      <div v-for="alert in alerts" :key="alert" class="strip__alert" role="status">
        <UIcon name="i-lucide-triangle-alert" aria-hidden="true" />
        <span>{{ alert }}</span>
        <UButton label="新建赛季" color="neutral" variant="outline" size="sm" @click="openEditor(null)" />
      </div>
      <div v-if="timeline" class="timeline" aria-hidden="true">
        <div class="timeline__track" />
        <button
          v-for="block in timeline.blocks"
          :key="block.seasonId"
          type="button"
          tabindex="-1"
          class="timeline__block"
          :class="`timeline__block--${block.tone}`"
          :style="{ left: `${block.left}%`, width: `${block.width}%` }"
          @click="openEditor(seasons.find((season) => season.seasonId === block.seasonId)!)"
        >{{ block.name }}</button>
        <span class="timeline__today" :style="{ left: `${timeline.today}%` }" />
        <span v-for="month in timeline.months" :key="month.left" class="timeline__month" :style="{ left: `${month.left}%` }">{{ month.label }}</span>
      </div>
    </section>

    <div class="filters" role="group" aria-label="按状态筛选">
      <button v-for="option in visibleFilters" :key="option.key" type="button" class="filter pressable" :aria-pressed="filter === option.key" @click="filter = option.key">
        {{ option.label }}<small class="num">{{ counts[option.key] }}</small>
      </button>
    </div>

    <p v-if="!adminData.loading.value && !seasons.length" class="text-sm text-muted">还没有赛季。</p>
    <ul v-else class="season-list surface-card" aria-label="赛季列表">
      <li v-for="season in rows" :key="season.seasonId" class="season-row">
        <div class="season-row__name">
          <button type="button" class="season-row__open" @click="openEditor(season)">{{ season.name }}</button>
          <span class="num">{{ rangeText(season) }}</span>
        </div>
        <UBadge :label="seasonPhaseLabel[season.phase]" :color="badgeColor(season.phase)" variant="subtle" />
        <USwitch
          :model-value="season.public"
          :label="season.public ? '可见' : '隐藏'"
          :aria-label="`${season.name}对玩家可见`"
          @update:model-value="toggleVisibility(season)"
        />
        <span class="season-row__players num">{{ season.phase === "draft" || season.phase === "scheduled" ? "—" : `${season.playerCount} 名玩家` }}</span>
        <UButton label="编辑" color="neutral" variant="outline" size="sm" :aria-label="`编辑 ${season.name}`" @click="openEditor(season)" />
      </li>
    </ul>

    <AdminResponsiveDialog v-model:open="editorOpen" :title="editing ? editing.name : '新建赛季'" size="sm" :dismissible="!saving">
      <template #body>
        <form id="season-form" class="grid gap-4" @submit.prevent="save(editing?.status === 'draft' || !editing ? 'draft' : 'keep')">
          <UFormField label="名称" required><UInput v-model="form.name" :disabled="saving" /></UFormField>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="开始日期" required><UInput v-model="form.startDate" type="date" :disabled="saving || startLocked" /></UFormField>
            <UFormField label="结束日期" required><UInput v-model="form.endDate" type="date" :disabled="saving" /></UFormField>
          </div>
          <p v-if="formIssue" class="text-sm text-error" role="alert">{{ formIssue }}</p>
          <p v-else class="text-sm text-muted num">共 {{ seasonWeeks(draftWindow) }} 周，按北京时间从开始日 0 点到结束日 24 点。{{ startLocked ? "进行中的赛季不能改开始日期。" : "" }}到结束时间后自动结束。</p>
          <UFormField label="玩家可见" :hint="!editing || editing.status === 'draft' ? '草稿始终对玩家隐藏，发布后按这里的设置显示。' : '关闭后排行榜里不再出现这个赛季，数据不受影响。'">
            <USwitch v-model="form.public" :disabled="saving" aria-label="玩家可见" />
          </UFormField>
          <p class="notice">赛季只统计地图精通 XP。成就解锁后永久持有，不受赛季影响；玩家的总精通 XP 也不会因为赛季清零。</p>
        </form>
      </template>
      <template #footer>
        <template v-if="!editing || editing.status === 'draft'">
          <UButton :label="publishLabel" :loading="saving" :disabled="Boolean(formIssue)" @click="save('publish')" />
          <UButton type="submit" form="season-form" label="保存草稿" color="neutral" variant="outline" :disabled="saving || Boolean(formIssue)" />
          <UButton label="取消" color="neutral" variant="ghost" :disabled="saving" @click="editorOpen = false" />
        </template>
        <template v-else>
          <UButton type="submit" form="season-form" label="保存" :loading="saving" :disabled="Boolean(formIssue)" />
          <UButton v-if="startLocked" :label="confirmEnd ? '再点一次确认提前结束' : '提前结束'" color="error" variant="outline" :disabled="saving" @click="endEarly" />
          <UButton label="取消" color="neutral" variant="ghost" :disabled="saving" @click="editorOpen = false" />
        </template>
      </template>
    </AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.num { font-variant-numeric: tabular-nums; }
.strip { display: grid; gap: var(--space-4); padding: var(--space-4) var(--space-5); }
.facts { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-8); }
.fact { display: grid; }
.fact strong { font-size: var(--type-label-size); font-weight: 600; }
.fact span { color: var(--muted); font-size: var(--type-label-sm-size); }
.strip__alert { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); border: 1px solid color-mix(in oklch, var(--warning) 40%, var(--line)); border-radius: var(--radius-control); background: color-mix(in oklch, var(--warning) 10%, var(--surface)); font-size: var(--type-body-sm-size); }
.strip__alert [class*="i-lucide-"] { flex: none; color: var(--warning); }
.strip__alert span { flex: 1; min-width: 12rem; }

.timeline { position: relative; height: 2.75rem; }
.timeline__track { position: absolute; inset: 0.5rem 0 auto; height: 1.25rem; border-radius: var(--radius-control); background: var(--surface-raised); }
.timeline__block { position: absolute; top: 0.5rem; height: 1.25rem; padding: 0 var(--space-2); overflow: hidden; border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: none; color: var(--text); font-size: var(--type-caption-size); font-weight: 600; line-height: 1.15rem; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.timeline__block--ended { background: var(--surface); color: var(--muted); }
.timeline__block--active { border-color: var(--accent); background: var(--accent-surface); }
.timeline__block--draft { border-style: dashed; color: var(--muted); }
.timeline__today { position: absolute; top: 0; bottom: 0.75rem; width: 0.125rem; background: var(--danger); }
.timeline__month { position: absolute; bottom: 0; color: var(--quiet); font-size: var(--type-caption-size); white-space: nowrap; transform: translateX(-50%); }

.filters { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.filter { display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--control-sm); padding: 0 var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-pill); background: var(--surface); color: var(--muted); font-size: var(--type-label-sm-size); font-weight: 500; cursor: pointer; }
.filter small { color: var(--quiet); font-size: var(--type-caption-size); }
.filter[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-surface); color: var(--text); font-weight: 600; }

.season-list { display: grid; margin: 0; padding: 0; overflow: hidden; list-style: none; }
.season-row { display: grid; grid-template-columns: minmax(0, 1fr) 6rem 7rem 7rem auto; align-items: center; gap: var(--space-2) var(--space-4); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--line); font-size: var(--type-body-sm-size); }
.season-row:last-child { border-bottom: 0; }
.season-row__name { display: grid; min-width: 0; }
.season-row__name span { color: var(--quiet); font-size: var(--type-caption-size); }
.season-row__open { padding: 0; border: 0; background: none; color: var(--text); font-size: var(--type-label-size); font-weight: 600; text-align: left; cursor: pointer; }
.season-row__open:hover { color: var(--accent); }
.season-row__players { text-align: right; }
.notice { margin: 0; padding: var(--space-3) var(--space-4); border-radius: var(--radius-control); background: var(--surface-raised); color: var(--muted); font-size: var(--type-body-sm-size); }
@media (max-width: 47.99rem) {
  .season-row { grid-template-columns: minmax(0, 1fr) auto; }
  .season-row__players { grid-column: 1; text-align: left; }
}
</style>
