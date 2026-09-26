<script setup lang="ts">
definePageMeta({
  middleware: ["auth", "admin-client"],
  redirect: "/admin/reviews",
});
</script>
