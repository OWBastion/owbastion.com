<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";
import { useDebounceFn } from "@vueuse/core";
import { portalErrorDetails } from "~/utils/portal-error";
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "称号迁移 · 躲避堡垒 3" });

type Grant = { grantId: string; titleKey: string; label: string; category: string; scope: "global" | "map"; mapName?: string; holderName: string; playerAccountId?: string; playerName?: string; playerId?: string; status: "unclaimed" | "active" | "revoked"; revokeReason?: string };
type Player = { playerAccountId: string; playerName: string; playerId: string };
type HolderGroup = { holderName: string; grants: Grant[]; unclaimedCount: number };

const toast = useToast();
const api = useAdminApi();
const query = ref("");
const grants = ref<Grant[]>([]);
const players = ref<Player[]>([]);
const selectedPlayerId = ref("");
const errorMessage = ref("");
const loading = ref(false);
const saving = ref(false);
const selectedHolder = ref<HolderGroup | null>(null);
const panelOpen = computed({ get: () => selectedHolder.value !== null && selectedPlayer.value !== undefined, set: (value) => { if (!value) selectedHolder.value = null; } });

const selectedPlayer = computed(() => players.value.find((player) => player.playerAccountId === selectedPlayerId.value));
const holderGroups = computed<HolderGroup[]>(() => {
  const groups = new Map<string, Grant[]>();
  for (const grant of grants.value) groups.set(grant.holderName, [...(groups.get(grant.holderName) ?? []), grant]);
  return [...groups].map(([holderName, holderGrants]) => ({ holderName, grants: holderGrants, unclaimedCount: holderGrants.filter((grant) => grant.status === "unclaimed").length }));
});

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [grantResponse, playerResponse] = await Promise.all([
      api<{ items: Grant[] }>(`/v1/title-grants?query=${encodeURIComponent(query.value)}`),
      api<{ items: Player[] }>("/v1/player-accounts?page=1&pageSize=50"),
    ]);
    grants.value = grantResponse.items;
    players.value = playerResponse.items;
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法读取历史称号，请稍后重试。").description;
  } finally {
    loading.value = false;
  }
}

const debouncedLoad = useDebounceFn(load, 300);

function handleSearchInput() {
  debouncedLoad();
}

function handleSearchSubmit() {
  debouncedLoad.cancel();
  void load();
}

async function grant(row: Grant) {
  if (!selectedPlayerId.value) return;
  saving.value = true;
  errorMessage.value = "";
  try {
    await api("/v1/title-grants", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", playerAccountId: selectedPlayerId.value, historicalTitleGrantId: row.grantId } });
    toast.add({ title: "已关联", color: "success" });
    await load();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法关联称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

async function revoke(row: Grant) {
  saving.value = true;
  errorMessage.value = "";
  try {
    await api(`/v1/title-grants/${row.grantId}/revoke`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1" } });
    toast.add({ title: "已撤销", color: "success" });
    await load();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法撤销称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}

function openBulk(group: HolderGroup) {
  if (!selectedPlayer.value || !group.unclaimedCount) return;
  selectedHolder.value = group;
}

function closeBulk() {
  selectedHolder.value = null;
}

const TOAST_TITLE_LIMIT = 5;
const MODAL_TITLE_LIMIT = 8;

const pendingGrants = computed(() => selectedHolder.value?.grants.filter((g) => g.status === "unclaimed") ?? []);
const pendingGrantsPreview = computed(() => pendingGrants.value.slice(0, MODAL_TITLE_LIMIT));
const pendingGrantsOverflow = computed(() => Math.max(0, pendingGrants.value.length - MODAL_TITLE_LIMIT));

async function grantAll() {
  if (!selectedHolder.value || !selectedPlayer.value) return;
  saving.value = true;
  errorMessage.value = "";
  const snapshot = pendingGrants.value.map((g) => g.mapName ? `${g.label} · ${g.mapName}` : g.label);
  try {
    const result = await api<{ grantedCount: number }>("/v1/title-grants/bulk", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: { contractVersion: "1", holderName: selectedHolder.value.holderName, playerAccountId: selectedPlayer.value.playerAccountId },
    });
    if (result.grantedCount) {
      const listed = snapshot.slice(0, TOAST_TITLE_LIMIT);
      const overflow = snapshot.length - listed.length;
      const description = overflow > 0 ? `${listed.join("、")} 等 +${overflow} 项` : listed.join("、");
      toast.add({ title: `已关联 ${result.grantedCount} 项称号`, description, color: "success" });
    } else {
      toast.add({ title: "暂无可关联称号", color: "success" });
    }
    await load();
    closeBulk();
  } catch (error) {
    errorMessage.value = portalErrorDetails(error, "无法关联称号，请稍后重试。").description;
  } finally {
    saving.value = false;
  }
}



const UButton = resolveComponent("UButton");
const UBadge = resolveComponent("UBadge");

const grantColumns = computed<TableColumn<Grant>[]>(() => [
  {
    accessorKey: "category",
    header: "分类",
    meta: { class: { th: "w-24", td: "w-24 text-sm" } },
  },
  {
    id: "title",
    header: "称号",
    cell: ({ row }) => {
      const label = row.original.label;
      const mapName = row.original.mapName;
      return mapName
        ? h("span", {}, [label, h("span", { class: "map-hint" }, ` · ${mapName}`)])
        : label;
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    meta: { class: { th: "w-52", td: "w-52" } },
    cell: ({ row }) => {
      const s = row.original.status;
      if (s === "unclaimed") return h(UBadge, { color: "neutral", variant: "subtle" }, () => "未关联");
      if (s === "active") return h("span", { class: "status-active" }, `已关联至 ${row.original.playerName}#${row.original.playerId}`);
      return h(UBadge, { color: "error", variant: "subtle" }, () => "已撤销");
    },
  },
  {
    id: "actions",
    meta: { class: { th: "w-20", td: "w-20 text-right" } },
    cell: ({ row }) => {
      const r = row.original;
      if (r.status === "unclaimed") {
        return h(UButton, { label: "关联", color: "neutral", variant: "outline", size: "sm", disabled: !selectedPlayer.value || saving.value, onClick: () => grant(r) });
      }
      if (r.status === "active") {
        return h(UButton, { label: "撤销", color: "neutral", variant: "link", size: "sm", disabled: saving.value, onClick: () => revoke(r) });
      }
      return null;
    },
  },
]);

onMounted(() => { void load(); });
</script>

<template>
  <AdminWorkspace title="称号迁移" :count="loading ? '读取中…' : `${holderGroups.length} 位持有者`">
    <template #messages><UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" /></template>
    <template #toolbar>
      <div class="admin-toolbar">
        <form role="search" class="search-form" aria-label="搜索称号记录" aria-controls="title-grant-results" @submit.prevent="handleSearchSubmit">
          <UInput
            v-model="query"
            type="search"
            placeholder="搜索持有者或称号"
            aria-label="搜索历史称号"
            @input="handleSearchInput"
          />
          <UButton type="submit" label="搜索" color="neutral" variant="outline" :loading="loading" />
        </form>
        <USelect
          v-model="selectedPlayerId"
          aria-label="选择操作玩家帐号"
          placeholder="选择玩家帐号"
          :items="players.map((player) => ({ label: `${player.playerName}#${player.playerId}`, value: player.playerAccountId }))"
        />
      </div>
    </template>

    <div id="title-grant-results" class="holder-list" aria-live="polite" aria-atomic="false">
      <section v-for="group in holderGroups" :key="group.holderName" class="holder-group">
        <div class="holder-heading">
          <div>
            <p class="eyebrow">历史持有者</p>
            <h2>{{ group.holderName }}</h2>
            <small>{{ group.unclaimedCount ? `${group.unclaimedCount} 项未关联` : "暂无未关联称号" }}</small>
          </div>
          <UButton :data-holder-name="group.holderName" label="关联全部未关联项" :disabled="!selectedPlayer || !group.unclaimedCount || saving" @click="openBulk(group)" />
        </div>
        <UTable :data="group.grants" :columns="grantColumns" :loading="saving" />
      </section>
      <p v-if="!loading && !holderGroups.length" class="empty surface-card">暂无匹配记录。</p>
    </div>

    <AdminResponsiveDialog v-model:open="panelOpen" title="确认称号迁移" size="sm" :dismissible="!saving"><template #body><section v-if="selectedHolder && selectedPlayer" class="sheet"><p class="eyebrow">批量关联</p><h2 id="bulk-migration-title">确认称号迁移</h2><div class="migration-facts"><p><span>历史持有者</span><strong>{{ selectedHolder.holderName }}</strong></p><p><span>关联至</span><strong><PlayerBattleTag :player-name="selectedPlayer.playerName" :player-id="selectedPlayer.playerId" /></strong></p></div><ul class="pending-list" aria-label="待关联称号"><li v-for="grant in pendingGrantsPreview" :key="grant.grantId"><span class="pending-label">{{ grant.label }}</span><span v-if="grant.mapName" class="pending-map">{{ grant.mapName }}</span></li><li v-if="pendingGrantsOverflow" class="pending-overflow">另有 {{ pendingGrantsOverflow }} 项未关联称号</li></ul><p class="sheet-copy">已关联和已撤销记录保持不变。</p><div class="sheet-actions"><UButton label="取消" color="neutral" variant="outline" :disabled="saving" @click="closeBulk" /><UButton label="确认关联" :loading="saving" @click="grantAll" /></div></section></template></AdminResponsiveDialog>
  </AdminWorkspace>
</template>

<style scoped>
.holder-list { display: grid; gap: 28px; }
.holder-group { display: grid; gap: 10px; }
.holder-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; }
.holder-heading .eyebrow { margin-bottom: 6px; }
.holder-heading h2 { margin: 0; font-size: clamp(1.3rem, 3vw, 1.75rem); letter-spacing: -.035em; overflow-wrap: anywhere; }
.holder-heading small { color: var(--quiet); font-size: .78rem; }
.search-form { display: contents; }
.map-hint { color: var(--quiet); font-size: .9em; }
.status-active { font-size: .85rem; color: var(--quiet); }
.danger { color: var(--danger); }
.empty { margin: 0; padding: 28px; color: var(--quiet); text-align: center; }
.sheet { position: relative; }
.sheet h2 { margin: 0; font-size: 2.1rem; letter-spacing: -.05em; }
.migration-facts { display: grid; gap: 12px; margin: 28px 0 16px; }
.migration-facts p { display: grid; gap: 5px; margin: 0; padding: 13px; border: 1px solid var(--line); border-radius: 11px; background: var(--surface); }
.migration-facts span { color: var(--quiet); font-size: .76rem; }
.migration-facts strong { overflow-wrap: anywhere; font-size: .92rem; }
.pending-list { list-style: none; margin: 0 0 18px; padding: 0; display: grid; gap: 1px; border: 1px solid var(--line); border-radius: 11px; overflow: hidden; }
.pending-list li { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 9px 13px; background: var(--surface); font-size: .85rem; overflow-wrap: anywhere; }
.pending-list li + li { border-top: 1px solid var(--line); }
.pending-map { color: var(--quiet); font-size: .78rem; flex-shrink: 0; }
.pending-overflow { color: var(--quiet); font-size: .78rem; font-style: italic; }
.sheet-copy { color: var(--muted); font-size: .83rem; line-height: 1.5; }
.sheet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 30px; }
@media (prefers-reduced-motion: reduce) { .migration-sheet-enter-active, .migration-sheet-leave-active, .migration-sheet-enter-active .sheet, .migration-sheet-leave-active .sheet { transition: opacity 140ms ease; }.migration-sheet-enter-from .sheet, .migration-sheet-leave-to .sheet { transform: none; } }
@media (max-width: 620px) { .holder-heading { align-items: start; flex-direction: column; }.sheet-actions { flex-direction: column-reverse; }.sheet-actions button { width: 100%; } }
</style>
