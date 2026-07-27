<script setup lang="ts">
import { h, resolveComponent } from "vue";
import type { TableColumn } from "@nuxt/ui";

type Grant = { grantId: string; label: string; category: string; mapName?: string; status: "unclaimed" | "active" | "revoked"; playerName?: string; playerId?: string };
type Holder = { holderName: string; totalCount: number; unclaimedCount: number; grants: Grant[] };
type Player = { playerAccountId: string; playerName: string; playerId: string };

const props = defineProps<{ holder: Holder | null; players: Player[]; selectedPlayerId: string; loading?: boolean; saving?: boolean }>();
const emit = defineEmits<{ "update:selectedPlayerId": [value: string]; grant: [grant: Grant]; revoke: [grant: Grant]; bulk: [] }>();
const UButton = resolveComponent("UButton");
const UBadge = resolveComponent("UBadge");
const playerItems = computed(() => props.players.map((player) => ({ label: `${player.playerName}#${player.playerId}`, value: player.playerAccountId })));
const columns = computed<TableColumn<Grant>[]>(() => [
  { accessorKey: "category", header: "分类", meta: { class: { th: "w-36", td: "w-36" } } },
  { id: "title", header: "称号", cell: ({ row }) => h("div", { class: "title-cell" }, [h("strong", {}, row.original.label), row.original.mapName ? h("small", {}, row.original.mapName) : null]) },
  { id: "status", header: "状态", cell: ({ row }) => row.original.status === "unclaimed" ? h(UBadge, { label: "未关联", color: "neutral", variant: "subtle" }) : row.original.status === "active" ? h(UBadge, { label: "已关联", color: "success", variant: "subtle" }) : h(UBadge, { label: "已撤销", color: "error", variant: "subtle" }) },
  { id: "actions", header: "操作", meta: { class: { th: "w-24", td: "w-24 text-right" } }, cell: ({ row }) => row.original.status === "unclaimed" ? h(UButton, { label: "关联", color: "neutral", variant: "outline", size: "sm", disabled: !props.selectedPlayerId || props.saving, onClick: () => emit("grant", row.original) }) : row.original.status === "active" ? h(UButton, { label: "撤销", color: "neutral", variant: "link", size: "sm", disabled: props.saving, onClick: () => emit("revoke", row.original) }) : null },
]);
</script>

<template>
  <UCard v-if="holder" class="detail-panel" variant="outline">
    <template #header>
      <div class="detail-header">
        <div class="detail-identity"><span class="detail-avatar" aria-hidden="true">{{ holder.holderName.slice(0, 1).toUpperCase() }}</span><div><p class="eyebrow">历史持有者</p><h2>{{ holder.holderName }}</h2><small>{{ holder.totalCount }} 项称号<span v-if="holder.unclaimedCount"> · {{ holder.unclaimedCount }} 项未关联</span></small></div></div>
        <div class="detail-action"><UFormField label="选择目标玩家帐号"><USelect :model-value="selectedPlayerId" :items="playerItems" placeholder="选择或搜索玩家帐号" :disabled="loading || saving" aria-label="选择目标玩家帐号" @update:model-value="emit('update:selectedPlayerId', $event)" /></UFormField><UButton label="关联全部未关联项" :disabled="!selectedPlayerId || !holder.unclaimedCount || saving" :loading="saving" @click="emit('bulk')" /></div>
      </div>
    </template>
    <AdminDataTable :data="holder.grants" :columns="columns" :loading="loading || saving" empty="暂无称号记录。" table-key="title-migration-grants" table-min-width="620px" class="admin-table" />
  </UCard>
  <UCard v-else class="detail-panel detail-panel--empty" variant="outline"><UEmpty title="选择历史持有者" description="从左侧列表选择需要迁移的记录。" variant="naked" /></UCard>
</template>

<style scoped>
.detail-panel { min-width: 0; }.detail-panel :deep([data-slot="header"]) { padding: 20px; }.detail-identity, .detail-action { display: flex; align-items: center; gap: 12px; }.detail-header { display: flex; align-items: end; justify-content: space-between; gap: 22px; }.detail-avatar { display: grid; flex: 0 0 auto; width: 42px; height: 42px; place-items: center; border-radius: 50%; color: var(--on-accent); background: var(--accent); font-weight: 750; }.detail-identity h2 { margin: 0; font-size: 1.25rem; letter-spacing: -.035em; }.detail-identity .eyebrow { margin-bottom: 3px; }.detail-identity small { color: var(--quiet); font-size: .74rem; }.detail-action { align-items: end; }.detail-action :deep(.portal-control), .detail-action :deep([data-slot="base"]) { min-width: 220px; }.detail-action :deep(.form-field) { gap: 5px; }.detail-panel--empty { display: grid; min-height: 360px; place-items: center; }.detail-panel :deep(.title-cell) { display: grid; gap: 3px; }.detail-panel :deep(.title-cell small) { color: var(--quiet); font-size: .74rem; }
@media (max-width: 760px) { .detail-header { align-items: stretch; flex-direction: column; }.detail-action { align-items: stretch; flex-direction: column; }.detail-action :deep(.portal-control), .detail-action :deep([data-slot="base"]) { width: 100%; min-width: 0; }.detail-action :deep(button) { width: 100%; } }
</style>
