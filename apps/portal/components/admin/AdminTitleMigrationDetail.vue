<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";
import type { SortingState } from "@tanstack/vue-table";

type Grant = { grantId: string; label: string; category: string; mapName?: string; status: "unclaimed" | "active" | "revoked"; playerName?: string; playerId?: string };
type Holder = { holderName: string; totalCount: number; unclaimedCount: number; grants: Grant[]; grantPage?: number; grantPageSize?: number; grantTotal?: number; grantHasMore?: boolean };
type Player = { playerAccountId: string; playerName: string; playerId: string };

const props = defineProps<{
  holder: Holder | null;
  players: Player[];
  selectedPlayerId: string;
  playerLoading?: boolean;
  playerError?: string;
  playerQuery?: string;
  playerHasMore?: boolean;
  playerTotal?: number;
  loading?: boolean;
  saving?: boolean;
  grantPage?: number;
  grantPageSize?: number;
}>();
const emit = defineEmits<{
  "update:selectedPlayerId": [value: string];
  "update:playerQuery": [value: string];
  "update:grantPage": [value: number];
  "load-more-players": [];
  grant: [grant: Grant];
  revoke: [grant: Grant];
  bulk: [];
}>();


const UButton = resolveComponent("UButton");
const UBadge = resolveComponent("UBadge");
const playerItems = computed(() => props.players.map((player) => ({ label: `${player.playerName}#${player.playerId}`, value: player.playerAccountId })));
const grantTotal = computed(() => props.holder?.grantTotal ?? props.holder?.grants.length ?? 0);
const grantPages = computed(() => Math.max(1, Math.ceil(grantTotal.value / (props.grantPageSize || props.holder?.grantPageSize || 50))));
const defaultGrantSorting: SortingState = [{ id: "category", desc: false }, { id: "title", desc: false }];
const grantSorting = shallowRef<SortingState>([...defaultGrantSorting]);
const grantSortingOptions = [
  { id: "category", label: "分类" },
  { id: "title", label: "称号" },
  { id: "status", label: "状态" },
];
const columns = computed<TableColumn<Grant>[]>(() => [
  { accessorKey: "category", header: "分类", meta: { class: { th: "w-36", td: "w-36" } } },
  { accessorKey: "label", id: "title", header: "称号", cell: ({ row }) => h("div", { class: "title-cell" }, [h("strong", {}, row.original.label), row.original.mapName ? h("small", {}, row.original.mapName) : null]) },
  { accessorKey: "status", id: "status", header: "状态", cell: ({ row }) => row.original.status === "unclaimed" ? h(UBadge, { label: "未关联", color: "neutral", variant: "subtle" }) : row.original.status === "active" ? h(UBadge, { label: "已关联", color: "success", variant: "subtle" }) : h(UBadge, { label: "已撤销", color: "error", variant: "subtle" }) },
  { id: "actions", header: "操作", meta: { class: { th: "w-24", td: "w-24 text-right" } }, cell: ({ row }) => row.original.status === "unclaimed" ? h(UButton, { label: "关联", color: "neutral", variant: "outline", size: "sm", disabled: !props.selectedPlayerId || props.saving, onClick: () => emit("grant", row.original) }) : row.original.status === "active" ? h(UButton, { label: "撤销", color: "neutral", variant: "link", size: "sm", disabled: props.saving, onClick: () => emit("revoke", row.original) }) : null },
]);

function onPlayerSearch(term: string) {
  emit("update:playerQuery", term);
}
</script>

<template>
  <UCard v-if="holder" class="detail-panel" variant="outline">
    <template #header>
      <div class="detail-header">
        <div class="detail-identity">
          <span class="detail-avatar" aria-hidden="true">{{ holder.holderName.slice(0, 1).toUpperCase() }}</span>
          <div>
            <p class="eyebrow">历史持有者</p>
            <h2>{{ holder.holderName }}</h2>
            <small>{{ holder.totalCount }} 项称号<span v-if="holder.unclaimedCount"> · {{ holder.unclaimedCount }} 项未关联</span></small>
          </div>
        </div>
        <div class="detail-action">
          <UFormField label="选择目标玩家帐号">
            <USelectMenu
              :model-value="selectedPlayerId || undefined"
              :search-term="playerQuery"
              :items="playerItems"
              value-key="value"
              label-key="label"
              placeholder="搜索玩家帐号"
              :loading="playerLoading"
              :disabled="loading || saving"
              :search-input="{ placeholder: '输入 BattleTag 或帐号名' }"
              ignore-filter
              aria-label="选择目标玩家帐号"
              @update:model-value="emit('update:selectedPlayerId', String($event ?? ''))"
              @update:search-term="onPlayerSearch"
            />
          </UFormField>
          <p v-if="playerError" class="player-state player-state--error" role="alert">{{ playerError }}</p>
          <p v-else-if="playerLoading && !players.length" class="player-state" role="status">正在搜索玩家…</p>
          <p v-else-if="!players.length" class="player-state" role="status">未找到可关联玩家</p>
          <div v-else-if="playerHasMore" class="player-load-more">
            <p class="player-state" role="status">已显示 {{ players.length }} / {{ playerTotal ?? players.length }} 位玩家</p>
            <UButton
              label="加载更多玩家"
              color="neutral"
              variant="ghost"
              size="sm"
              :loading="playerLoading"
              :disabled="playerLoading"
              @click="emit('load-more-players')"
            />
          </div>
          <UButton label="关联全部未关联项" :disabled="!selectedPlayerId || !holder.unclaimedCount || saving" :loading="saving" @click="emit('bulk')" />

        </div>
      </div>
    </template>
    <AdminDataTable
      v-model:sorting="grantSorting"
      :sorting-options="grantSortingOptions"
      :default-sorting="defaultGrantSorting"
      :data="holder.grants"
      :columns="columns"
      :mobile-columns="[{ id: 'title', priority: 'primary', order: 0 }, { id: 'status', priority: 'primary', order: 1 }, { id: 'category', priority: 'detail', order: 2 }]"
      row-key="grantId"
      :loading="loading || saving"
      empty="暂无称号记录。"
      table-key="title-migration-grants"
      table-min-width="620px"
      class="admin-table"
    >
      <template #actions-cell="{ row }">
        <div class="table-actions">
          <UButton v-if="row.original.status === 'unclaimed'" label="关联" color="neutral" variant="outline" size="sm" :disabled="!selectedPlayerId || saving" @click="emit('grant', row.original)" />
          <UButton v-else-if="row.original.status === 'active'" label="撤销" color="neutral" variant="link" size="sm" :disabled="saving" @click="emit('revoke', row.original)" />
        </div>
      </template>
    </AdminDataTable>
    <div v-if="grantPages > 1 || (holder.grantHasMore ?? false)" class="grant-pagination">
      <p class="grant-pagination__meta">共 {{ grantTotal }} 项 · 第 {{ grantPage || holder.grantPage || 1 }} 页</p>
      <UPagination
        :page="grantPage || holder.grantPage || 1"
        :total="grantTotal"
        :items-per-page="grantPageSize || holder.grantPageSize || 50"
        :disabled="loading || saving"
        @update:page="emit('update:grantPage', $event)"
      />
    </div>
  </UCard>
  <UCard v-else class="detail-panel detail-panel--empty" variant="outline">
    <UEmpty title="选择历史持有者" description="从左侧列表选择需要迁移的记录。" variant="naked" />
  </UCard>
</template>

<style scoped>
.detail-panel { min-width: 0; }
.detail-panel :deep([data-slot="header"]) { padding: 20px; }
.detail-identity, .detail-action { display: flex; align-items: center; gap: 12px; }
.detail-header { display: flex; align-items: end; justify-content: space-between; gap: 22px; }
.detail-avatar { display: grid; flex: 0 0 auto; width: 42px; height: 42px; place-items: center; border-radius: 50%; color: var(--on-accent); background: var(--accent); font-weight: 750; }
.detail-identity h2 { margin: 0; font-size: 1.25rem; letter-spacing: -.035em; }
.detail-identity .eyebrow { margin-bottom: 3px; }
.detail-identity small { color: var(--quiet); font-size: .74rem; }
.detail-action { align-items: end; flex-wrap: wrap; }
.detail-action :deep(.portal-control), .detail-action :deep([data-slot="base"]) { min-width: 220px; }
.detail-action :deep(.form-field) { gap: 5px; }
.player-state { margin: 0; width: 100%; color: var(--quiet); font-size: .74rem; }
.player-state--error { color: var(--error, #b42318); }
.player-load-more { display: grid; gap: 6px; width: 100%; }

.grant-pagination { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 4px 4px; }
.grant-pagination__meta { margin: 0; color: var(--quiet); font-size: .74rem; }
.detail-panel--empty { display: grid; min-height: 360px; place-items: center; }
.detail-panel :deep(.title-cell) { display: grid; gap: 3px; }
.detail-panel :deep(.title-cell small) { color: var(--quiet); font-size: .74rem; }
@media (max-width: 760px) {
  .detail-header { align-items: stretch; flex-direction: column; }
  .detail-action { align-items: stretch; flex-direction: column; }
  .detail-action :deep(.portal-control), .detail-action :deep([data-slot="base"]) { width: 100%; min-width: 0; }
  .detail-action :deep(button) { width: 100%; }
  .grant-pagination { flex-direction: column; align-items: stretch; }
}
</style>
