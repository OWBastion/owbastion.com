<script setup lang="ts">
import type { AdminReviewImportPreview, AdminReviewImportResponse } from "~/composables/useAdminApi";
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";

type EventChoice = { eventId: string; name: string; releaseStatus: string; gameVersion: string };

const emit = defineEmits<{ imported: [count: number] }>();
const api = useAdminApi();
const file = ref<File | null>(null);
const preview = ref<AdminReviewImportPreview | null>(null);
const resolutions = ref<Record<string, string>>({});
const allEvents = ref<EventChoice[] | null>(null);
const busy = ref(false);
const error = ref("");

const statusLabels: Record<string, string> = { implemented: "已实装", development: "开发中", removed: "已移除" };
const choiceItems = (choices: EventChoice[]) => choices.map((event) => ({ label: `${event.name}（${statusLabels[event.releaseStatus] ?? event.releaseStatus} · 版本 ${event.gameVersion}）`, value: event.eventId }));
const itemsFor = (unresolved: AdminReviewImportPreview["unresolved"][number]) => choiceItems(unresolved.candidates.length ? unresolved.candidates : allEvents.value ?? []);
const ready = computed(() => preview.value !== null && !preview.value.errors.length && !preview.value.unresolved.length);

watch(file, () => { preview.value = null; resolutions.value = {}; error.value = ""; });

async function body() {
  return { contractVersion: "1", fileName: file.value!.name, csv: await file.value!.text(), resolutions: resolutions.value };
}

async function runPreview() {
  if (!file.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    preview.value = await api<AdminReviewImportPreview>("/v1/reviews/imports/preview", { method: "POST", body: await body() });
    if (preview.value.unresolved.some((item) => !item.candidates.length) && !allEvents.value) {
      allEvents.value = (await api<{ items: EventChoice[] }>("/v1/events")).items;
    }
  } catch (cause) { error.value = portalErrorDetails(cause, "无法预检 CSV。").description; }
  finally { busy.value = false; }
}

async function choose(name: string, eventId: string | undefined) {
  if (!eventId) return;
  resolutions.value = { ...resolutions.value, [name]: eventId };
  await runPreview();
}

async function confirm() {
  if (!file.value || !ready.value || busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await api<AdminReviewImportResponse>("/v1/reviews/imports", { method: "POST", headers: { "Idempotency-Key": createRequestId() }, body: await body() });
    emit("imported", result.importedCount);
  } catch (cause) { error.value = portalErrorDetails(cause, "无法导入 CSV。").description; }
  finally { busy.value = false; }
}
</script>

<template>
  <UCard>
    <template #header><div><p class="text-sm font-medium">导入历史评分</p><p class="text-sm text-muted">低频维护操作：先预检，再确认写入。导入的评分匿名展示，不关联玩家账号。</p></div></template>
    <div class="grid gap-3">
      <UFileUpload v-model="file" accept=".csv,text/csv" label="选择评分收集表 CSV" />
      <div class="flex gap-2">
        <UButton label="预检" color="neutral" variant="outline" :loading="busy" :disabled="!file" @click="runPreview" />
        <UButton v-if="ready" label="确认导入" :loading="busy" @click="confirm" />
      </div>
      <UAlert v-if="error" color="error" variant="subtle" :description="error" />
      <UAlert v-if="preview?.errors.length" color="error" variant="subtle" :title="`发现 ${preview.errors.length} 个问题`" :description="preview.errors.map((item) => item.row ? `第 ${item.row} 行：${item.message}` : item.message).join('；')" />
      <section v-if="preview?.unresolved.length" class="grid gap-2" aria-label="需要选择对应事件">
        <UAlert color="warning" variant="subtle" :title="`${preview.unresolved.length} 个事件名无法唯一匹配`" description="事件已改名或存在同名事件。请为每个名称选择对应的事件。" />
        <div v-for="item in preview.unresolved" :key="item.name" class="flex flex-wrap items-center gap-2">
          <span class="text-sm">「{{ item.name }}」{{ item.rowCount }} 行</span>
          <USelectMenu :model-value="resolutions[item.name]" :items="itemsFor(item)" value-key="value" class="min-w-64" placeholder="选择对应事件" :aria-label="`为「${item.name}」选择对应事件`" @update:model-value="choose(item.name, $event)" />
        </div>
      </section>
      <UAlert v-else-if="preview && !preview.errors.length" color="success" variant="subtle" :description="`共 ${preview.rowCount} 行，可导入 ${preview.importCount} 条。`" />
    </div>
  </UCard>
</template>
