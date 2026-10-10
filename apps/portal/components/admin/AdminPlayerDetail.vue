<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import { buildPlayerTimeline } from "~/utils/player-timeline";

const props = defineProps<{ player: AdminPlayerDetail; loading?: boolean }>();
const emit = defineEmits<{ setStatus: [status: "active" | "banned"]; unbind: [bindingId: string]; editIdentity: []; issueRecovery: []; changed: [] }>();

const tabs = [{ id: "titles", label: "称号" }, { id: "timeline", label: "动态" }, { id: "account", label: "账号" }] as const;
const tab = shallowRef<(typeof tabs)[number]["id"]>("titles");
const titlesRef = useTemplateRef<{ openGrant: () => void; openEquip: () => void }>("titlesRef");
const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
const banned = computed(() => props.player.status === "banned");
const activeTitleCount = computed(() => props.player.titleGrants.filter((grant) => grant.status === "active").length);
const equipable = computed(() => props.player.titleGrants.filter((grant) => grant.equipable === true));
const needsEquip = computed(() => equipable.value.length > 10 && equipable.value.every((grant) => !grant.equipped));
const timeline = computed(() => buildPlayerTimeline(props.player));
const menu = computed<DropdownMenuItem[][]>(() => [
  [
    { label: "查看通关记录", icon: "i-lucide-trophy", to: `/admin/verified-runs?playerAccountId=${encodeURIComponent(props.player.playerAccountId)}` },
    { label: "编辑战网 ID", icon: "i-lucide-pencil", onSelect: () => emit("editIdentity") },
    { label: "编辑佩戴选择", icon: "i-lucide-star", onSelect: () => titlesRef.value?.openEquip() },
    { label: "签发 Passkey 恢复链接", icon: "i-lucide-key-round", disabled: banned.value, onSelect: () => emit("issueRecovery") },
  ],
  [banned.value
    ? { label: "解除封禁", icon: "i-lucide-lock-open", onSelect: () => emit("setStatus", "active") }
    : { label: "封禁玩家", icon: "i-lucide-ban", color: "error", onSelect: () => emit("setStatus", "banned") }],
]);
function grantTitle() { tab.value = "titles"; void nextTick(() => titlesRef.value?.openGrant()); }
</script>

<template>
  <article class="player" aria-label="玩家详情">
    <header class="player__head">
      <UButton to="/admin/players" class="player__back" icon="i-lucide-arrow-left" label="返回列表" color="neutral" variant="ghost" size="sm" />
      <div class="player__heading">
        <h2>{{ player.playerName }}<small>#{{ player.playerId }}</small></h2>
        <p>{{ activeTitleCount }} 个称号 · {{ player.bindingCount }} 个 QQ 绑定 · {{ player.progression.activeVerifiedRunCount }} 次已核验通关</p>
      </div>
      <div class="player__actions">
        <UButton label="发放称号" icon="i-lucide-plus" :disabled="loading" @click="grantTitle" />
        <UDropdownMenu :items="menu"><UButton icon="i-lucide-ellipsis" color="neutral" variant="outline" aria-label="更多操作" :disabled="loading" /></UDropdownMenu>
      </div>
    </header>

    <div class="player__alerts">
      <UAlert v-if="banned" color="error" variant="subtle" title="该玩家已被封禁" description="封禁期间无法继续使用当前帐号。" :actions="[{ label: '解除封禁', color: 'neutral', variant: 'outline', onClick: () => emit('setStatus', 'active') }]" />
      <UAlert v-if="needsEquip" color="warning" variant="subtle" title="需要选择佩戴称号" description="迁移保留了全部称号，但没有初始化佩戴选择。" :actions="[{ label: '选择佩戴称号', color: 'neutral', variant: 'outline', onClick: () => titlesRef?.openEquip() }]" />
      <UAlert v-if="player.pendingSubmissionCount" color="info" variant="subtle" :title="`有 ${player.pendingSubmissionCount} 条提交等待审核`" :actions="[{ label: '去审核', to: '/admin/reviews', color: 'neutral', variant: 'outline' }]" />
    </div>

    <div class="player__tabs" role="tablist" aria-label="玩家详情分区" :style="{ '--tab-index': tabs.findIndex((item) => item.id === tab) }">
      <button v-for="item in tabs" :id="`player-tab-${item.id}`" :key="item.id" type="button" role="tab" class="player__tab" :aria-selected="tab === item.id" :aria-controls="`player-panel-${item.id}`" @click="tab = item.id">{{ item.label }}</button>
    </div>

    <section v-show="tab === 'titles'" id="player-panel-titles" role="tabpanel" aria-labelledby="player-tab-titles">
      <AdminPlayerTitles ref="titlesRef" :player-account-id="player.playerAccountId" :title-grants="player.titleGrants" :loading="loading" @changed="emit('changed')" />
    </section>

    <section v-show="tab === 'timeline'" id="player-panel-timeline" role="tabpanel" aria-labelledby="player-tab-timeline">
      <ol v-if="timeline.length" class="timeline">
        <li v-for="entry in timeline" :key="entry.id" class="timeline__item">
          <div class="timeline__body"><strong>{{ entry.title }}</strong><small v-if="entry.detail">{{ entry.detail }}</small></div>
          <div class="timeline__side"><StatusBadge v-if="entry.status" :label="entry.status.label" :tone="entry.status.tone" /><time>{{ formatTime(entry.at) }}</time></div>
        </li>
      </ol>
      <p v-else class="player__empty">还没有动态。</p>
    </section>

    <section v-show="tab === 'account'" id="player-panel-account" role="tabpanel" aria-labelledby="player-tab-account" class="account">
      <dl class="account__ids">
        <div><dt>战网 ID</dt><dd>{{ player.playerName }}#{{ player.playerId }}</dd></div>
        <div><dt>最近更新</dt><dd>{{ formatTime(player.updatedAt) }}</dd></div>
      </dl>
      <h3>QQ 绑定</h3>
      <ul v-if="player.bindings.length" class="account__bindings">
        <li v-for="binding in player.bindings" :key="binding.bindingId">
          <div><strong>{{ binding.memberOpenId }}</strong><small>{{ binding.groupOpenId }} · {{ formatTime(binding.createdAt) }}</small></div>
          <UButton label="解除绑定" size="sm" color="error" variant="ghost" :disabled="loading" @click="emit('unbind', binding.bindingId)" />
        </li>
      </ul>
      <p v-else class="player__empty">没有 QQ 绑定。</p>
      <h3>Passkey 恢复</h3>
      <p class="account__note">玩家丢失 Passkey 时，核验身份后可签发一次性恢复链接。</p>
      <UButton label="签发恢复链接" icon="i-lucide-key-round" color="warning" variant="soft" class="account__recover" :disabled="loading || banned" @click="emit('issueRecovery')" />
    </section>
  </article>
</template>

<style scoped>
.player { container-type: inline-size; display: grid; gap: var(--space-4); min-width: 0; }
.player__head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
.player__back { flex: 1 0 100%; justify-content: flex-start; width: fit-content; }
.player__heading { flex: 1 1 12rem; min-width: 0; }
.player__heading h2 { margin: 0; font-size: var(--type-headline-size); overflow-wrap: anywhere; }
.player__heading h2 small { margin-left: var(--space-1); color: var(--quiet); font-size: var(--type-label-size); font-weight: 600; }
.player__heading p { margin: var(--space-1) 0 0; color: var(--quiet); font-size: var(--type-caption-size); }
.player__actions { display: flex; flex: 1 1 100%; gap: var(--space-2); }
.player__actions > :first-child { flex: 1; }
.player__alerts { display: grid; gap: var(--space-2); }
.player__alerts:empty { display: none; }
.player__tabs { position: relative; display: grid; grid-template-columns: repeat(3, 5.5rem); border-bottom: 1px solid var(--line); }
.player__tabs::after { content: ""; position: absolute; bottom: -1px; left: 0; width: 5.5rem; height: 2px; background: var(--accent); transform: translateX(calc(var(--tab-index) * 100%)); transition: transform 320ms cubic-bezier(.2, .9, .3, 1); }
.player__tab { min-height: 2.75rem; border: 0; background: transparent; color: var(--muted); font-weight: 600; cursor: pointer; transition: color 140ms ease, transform 100ms ease-out; }
.player__tab:active { transform: scale(.96); }
.player__tab[aria-selected="true"] { color: var(--text); }
[role="tabpanel"] { animation: panel-in 180ms ease-out; }
@keyframes panel-in { from { opacity: 0; transform: translateY(.25rem); } }
@media (prefers-reduced-motion: reduce) { [role="tabpanel"] { animation: none; } .player__tabs::after { transition: none; } .player__tab { transition: none; } .player__tab:active { transform: none; } }
.player__empty { margin: 0; color: var(--quiet); }
.timeline { display: grid; margin: 0; padding: 0; list-style: none; }
.timeline__item { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--line); }
.timeline__body { display: grid; gap: var(--space-1); min-width: 0; }
.timeline__body strong { overflow-wrap: anywhere; }
.timeline__body small, .timeline__side time { color: var(--quiet); font-size: var(--type-caption-size); }
.timeline__side { display: grid; flex: none; justify-items: end; gap: var(--space-1); }
.account { display: grid; gap: var(--space-3); }
.account h3 { margin: var(--space-3) 0 0; font-size: var(--type-label-size); }
.account__ids { display: grid; gap: var(--space-2); margin: 0; }
.account__ids div { display: flex; gap: var(--space-3); }
.account__ids dt { width: 5rem; color: var(--quiet); }
.account__ids dd { margin: 0; overflow-wrap: anywhere; }
.account__bindings { display: grid; gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.account__bindings li { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-control); }
.account__bindings li div { display: grid; gap: var(--space-1); min-width: 0; overflow-wrap: anywhere; }
.account__bindings small, .account__note { color: var(--quiet); }
.account__note { margin: 0; }
.account__recover { width: fit-content; }
@container (min-width: 40rem) {
  .player__back { display: none; }
  .player__actions { flex: none; }
  .player__actions > :first-child { flex: none; }
}
</style>
