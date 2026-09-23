<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "待处理 · 躲避堡垒 3" });

const { groups, loading, load } = useAdminInbox();
const countLabel = computed(() => {
  if (loading.value) return "读取中…";
  if (groups.value.some((group) => group.count === null)) return "部分队列不可用";
  return `${groups.value.reduce((total, group) => total + (group.count ?? 0), 0)} 项`;
});

onMounted(() => void load());
</script>

<template>
  <AdminWorkspace title="待处理" :count="countLabel">
    <template #actions>
      <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="loading" @click="load" />
    </template>
    <AdminPendingWork :groups="groups" :loading="loading" />
  </AdminWorkspace>
</template>
