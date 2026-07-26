<script setup lang="ts">
definePageMeta({ middleware: ["auth", "admin-client"] });
useSeoMeta({ title: "称号发放 · 躲避堡垒 3" });
await navigateTo("/admin/players", { redirectCode: 302 });
</script>
