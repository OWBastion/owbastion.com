<script setup lang="ts">
import ReviewEditor from "./ReviewEditor.vue";
import ReviewSummary from "./ReviewSummary.vue";
import type { ReviewTargetType } from "~/composables/usePlayerReview";

const props = defineProps<{
  targetType: ReviewTargetType;
  targetId: string;
  authenticated: boolean;
}>();

const emit = defineEmits<{ "review-changed": [] }>();

const route = useRoute();
const review = usePlayerReview(() => props.targetType, () => props.targetId, () => props.authenticated);
const loginPath = computed(() => "/login?returnTo=" + encodeURIComponent(route.fullPath));
const titleId = computed(() => "review-title-" + props.targetId.replace(/[^a-zA-Z0-9_-]/g, "-"));
const summary = computed(() => review.summary.value);
const comments = computed(() => review.comments.value);
const currentReview = computed(() => review.currentReview.value);
const loading = computed(() => review.loading.value);
const saving = computed(() => review.saving.value);
const error = computed(() => review.error.value);
const success = computed(() => review.success.value);
const unavailable = computed(() => review.unavailable.value);
const reviewPage = computed(() => review.page.value);
const reviewTotal = computed(() => review.total.value);
const reviewHasMore = computed(() => review.hasMore.value);
const draftRating = computed({ get: () => review.draftRating.value, set: (value) => { review.draftRating.value = value; } });
const draftComment = computed({ get: () => review.draftComment.value, set: (value) => { review.draftComment.value = value; } });
const draftAnonymous = computed({ get: () => review.draftAnonymous.value, set: (value) => { review.draftAnonymous.value = value; } });

const retry = () => review.load(1, true);
const save = async () => { if (await review.save()) emit("review-changed"); };
const withdraw = async () => { if (await review.withdraw()) emit("review-changed"); };
</script>

<template>
  <section class="detail-section review-panel" :aria-labelledby="titleId">
    <div class="section-title"><h3 :id="titleId">玩家评分</h3><UBadge v-if="loading" label="读取中" color="neutral" variant="subtle" /><UBadge v-else-if="unavailable" label="暂不可用" color="warning" variant="subtle" /><UBadge v-else label="公开结果" color="neutral" variant="subtle" /></div>
    <ReviewSummary :summary="summary" :comments="comments" :loading="loading" :page="reviewPage" :total="reviewTotal" :has-more="reviewHasMore" @page="review.changePage" />
    <UAlert v-if="unavailable" color="warning" variant="subtle" title="评价暂不可用" description="这项内容已无法读取评价。" />
    <template v-else>
      <UAlert v-if="error && !loading && !props.authenticated" color="error" variant="subtle" :description="error" role="alert" />
      <UAlert v-if="success" color="success" variant="subtle" :description="success" aria-live="polite" />
      <div v-if="!props.authenticated" class="review-guest"><NuxtLink class="secondary-button review-login" :to="loginPath">登录后评分</NuxtLink></div>
      <ReviewEditor v-else-if="!loading" :current-review="currentReview" :rating="draftRating" :comment="draftComment" :anonymous="draftAnonymous" :saving="saving" :error="error" @update:rating="draftRating = $event" @update:comment="draftComment = $event" @update:anonymous="draftAnonymous = $event" @save="save" @withdraw="withdraw" />
      <button v-if="error && !unavailable" class="secondary-button review-retry" type="button" :disabled="loading" @click="retry">重新读取评价</button>
    </template>
  </section>
</template>

<style scoped>
.review-panel { gap: 15px; }.review-guest { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding-top: 17px; border-top: 1px solid var(--line); }.review-guest p { margin: 0; color: var(--muted); font-size: .82rem; }.review-login, .review-retry { min-height: 44px; flex: 0 0 auto; }.review-retry { width: fit-content; }.review-panel :deep(.secondary-button) { display: inline-flex; align-items: center; justify-content: center; padding: 8px 13px; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--text); background: var(--surface); font: inherit; text-decoration: none; }.review-panel :deep(.secondary-button:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 430px) { .review-guest { align-items: stretch; flex-direction: column; gap: 10px; }.review-login { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .review-panel :deep(*) { scroll-behavior: auto; } }
@media (prefers-contrast: more) { .review-panel :deep(.secondary-button) { border-color: var(--line-strong); } }
</style>
