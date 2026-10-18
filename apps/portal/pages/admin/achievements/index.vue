<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });

// Legacy `?section=` deep links keep working; other query keys (mapId, ruleId) carry over.
const route = useRoute();
const section = Array.isArray(route.query.section) ? route.query.section[0] : route.query.section;
const { section: _section, ...query } = route.query;
const path = section === "map" ? "/admin/achievements/map-challenges" : "/admin/achievements/titles";

await navigateTo({ path, query }, { redirectCode: 302, replace: true });
</script>

<template />
