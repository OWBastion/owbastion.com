<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "称号与挑战 · 躲避堡垒 3" });

// The title catalog and general challenge pages merged into 称号 (#450).
const route = useRoute();
await navigateTo({ path: "/admin/achievements/titles", query: route.query }, { redirectCode: 302, replace: true });
</script>

<template />
