<script setup lang="ts">
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";
import type { AdminTitleChallenge } from "./admin-title-types";

const props = defineProps<{ challenge: AdminTitleChallenge; label: string }>();
const emit = defineEmits<{ saved: [] }>();
const api = useAdminApi();
const toast = useToast();
const saving = shallowRef(false);

// Only an open challenge with an end time can be listed as an active challenge.
const available = computed(() => props.challenge.status === "active" && props.challenge.endsAt !== null);

async function save(featured: boolean) {
  saving.value = true;
  try {
    await api(`/v1/achievements/${encodeURIComponent(props.challenge.challengeId)}/lifecycle`, {
      method: "PUT",
      headers: { "Idempotency-Key": createRequestId() },
      body: { contractVersion: "1", status: props.challenge.status, featured },
    });
    emit("saved");
  } catch (error) {
    toast.add({ title: portalErrorDetails(error, "无法保存展示设置，请稍后重试。").description, color: "error" });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <USwitch v-if="available" size="sm" label="公开展示" :aria-label="`公开展示${label}的挑战`" :model-value="challenge.featured" :disabled="saving" @update:model-value="save" />
</template>
