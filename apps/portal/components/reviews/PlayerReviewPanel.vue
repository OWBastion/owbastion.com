<script setup lang="ts">
import ReviewEditor from "./ReviewEditor.vue";
import ReviewSummary from "./ReviewSummary.vue";
import type { ReviewTargetType } from "~/composables/usePlayerReview";

const props = defineProps<{
  targetType: ReviewTargetType;
  targetId: string;
  authenticated: boolean;
  gameplayRevisionId?: string | null;
  // Starts folded behind its heading, for surfaces where reviews are secondary.
  collapsible?: boolean;
}>();

const emit = defineEmits<{ "review-changed": [] }>();

const route = useRoute();
const review = usePlayerReview(() => props.targetType, () => props.targetId, () => props.authenticated, () => props.gameplayRevisionId ?? null);
const loginPath = computed(() => "/login?returnTo=" + encodeURIComponent(route.fullPath));
const titleId = computed(() => "review-title-" + props.targetId.replace(/[^a-zA-Z0-9_-]/g, "-"));
const open = shallowRef(!props.collapsible);
const bodyId = computed(() => `${titleId.value}-body`);
const summary = computed(() => review.summary.value);
const comments = computed(() => review.comments.value);
const currentReview = computed(() => review.currentReview.value);
const loading = computed(() => review.loading.value);
const saving = computed(() => review.saving.value);
const error = computed(() => review.error.value);
const success = computed(() => review.success.value);
const unavailable = computed(() => review.unavailable.value);
const reviewPage = computed(() => review.page.value);
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
    <div class="section-title">
      <h3 :id="titleId">
        <button v-if="collapsible" type="button" class="review-toggle" :aria-expanded="open" :aria-controls="bodyId" @click="open = !open">玩家评分<UIcon name="i-lucide-chevron-down" class="review-toggle__icon" aria-hidden="true" /></button>
        <template v-else>玩家评分</template>
      </h3><UBadge v-if="loading" label="读取中" color="neutral" variant="subtle" /><UBadge v-else-if="unavailable" label="暂不可用" color="warning" variant="subtle" /></div>
    <div v-show="open" :id="bodyId" class="review-body">
      <ReviewSummary :summary="summary" :comments="comments" :loading="loading" :page="reviewPage" :has-more="reviewHasMore" @page="review.changePage" />
      <UAlert v-if="unavailable" color="warning" variant="subtle" title="评价暂不可用" description="这项内容已无法读取评价。" />
      <template v-else>
        <UAlert v-if="error && !loading && !props.authenticated" color="error" variant="subtle" :description="error" role="alert" />
        <UAlert v-if="success" color="success" variant="subtle" :description="success" aria-live="polite" />
        <div v-if="!props.authenticated" class="review-guest action-row"><UButton :to="loginPath" label="登录后评分" /></div>
        <ReviewEditor v-else-if="!loading" :current-review="currentReview" :rating="draftRating" :comment="draftComment" :anonymous="draftAnonymous" :saving="saving" :error="error" @update:rating="draftRating = $event" @update:comment="draftComment = $event" @update:anonymous="draftAnonymous = $event" @save="save" @withdraw="withdraw" />
        <div v-if="error && !unavailable" class="action-row"><UButton type="button" color="neutral" variant="outline" label="重新读取评价" :disabled="loading" @click="retry" /></div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.review-panel { gap: var(--space-4); }
.review-body { display: grid; gap: var(--space-4); }
.review-toggle { display: inline-flex; align-items: center; gap: var(--space-1); padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.review-toggle__icon { transition: transform var(--motion-fast, 150ms); }
.review-toggle[aria-expanded="true"] .review-toggle__icon { transform: rotate(180deg); }
.review-guest { padding-top: var(--space-4); border-top: 1px solid var(--line); }
.review-guest p { margin: 0; color: var(--muted); font-size: .82rem; }
@media (prefers-reduced-motion: reduce) { .review-panel :deep(*) { scroll-behavior: auto; } }
</style>
