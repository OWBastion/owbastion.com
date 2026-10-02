<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'admin-client'] });
useSeoMeta({ title: '内部服务凭据 · 躲避堡垒 3' });
</script>

<template>
  <AdminServiceTokenManager />
</template>
