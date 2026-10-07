<script setup lang="ts">
type EventVersion = { gameVersion: string; availability: "available" | "suspended"; eventCount: number };

defineProps<{ versions: EventVersion[]; saving: string | null }>();
const emit = defineEmits<{ toggle: [version: EventVersion, availability: EventVersion["availability"]] }>();
</script>

<template>
  <div class="grid gap-1">
    <p class="px-2 pb-1 text-xs text-muted">挂起仅影响下一次 Bastion 同步、构建或发布。</p>
    <p v-if="!versions.length" class="px-2 py-1 text-sm text-muted">暂无事件版本。</p>
    <label v-for="version in versions" :key="version.gameVersion" class="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-elevated">
      <span class="min-w-0"><strong>{{ version.gameVersion }}</strong><span class="ml-2 text-sm text-muted">{{ version.eventCount }} 条</span></span>
      <USwitch :model-value="version.availability === 'available'" :disabled="saving !== null" :loading="saving === version.gameVersion" :aria-label="`${version.availability === 'available' ? '挂起' : '恢复'}版本 ${version.gameVersion}`" @update:model-value="emit('toggle', version, $event ? 'available' : 'suspended')" />
    </label>
  </div>
</template>
