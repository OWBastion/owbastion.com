<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "成就与称号 · 躲避堡垒 3" });

await navigateTo({ path: "/admin/achievements", query: { section: "map" } }, { redirectCode: 302 });
</script>

<template />
