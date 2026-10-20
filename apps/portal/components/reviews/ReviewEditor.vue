<script setup lang="ts">
import type { PlayerReview, ReviewRating } from "~/composables/usePlayerReview";

defineProps<{
  currentReview: PlayerReview | null;
  rating: ReviewRating;
  comment: string;
  anonymous: boolean;
  saving: boolean;
  error: string;
}>();

const emit = defineEmits<{
  "update:rating": [ReviewRating];
  "update:comment": [string];
  "update:anonymous": [boolean];
  save: [];
  withdraw: [];
}>();

const ratings: ReviewRating[] = [1, 2, 3, 4, 5];
</script>

<template>
  <form class="review-editor" @submit.prevent="emit('save')">
    <div class="review-editor-heading"><div><h4>{{ currentReview ? "编辑评价" : "写下评价" }}</h4></div><span>{{ comment.length }}/500</span></div>
    <fieldset class="review-rating-fieldset" :disabled="saving">
      <legend>评分</legend>
      <div class="review-rating-options" role="group">
        <UButton v-for="value in ratings" :key="value" :icon="'i-lucide-star'" color="neutral" variant="ghost" :class="value <= rating ? 'text-primary' : 'text-muted'" :aria-label="value + ' 星'" :aria-pressed="rating === value" @click="emit('update:rating', value)" />
        <span class="review-rating-value">{{ rating }} / 5</span>
      </div>
    </fieldset>
    <UFormField class="review-comment-field" label="评价内容"><UTextarea :model-value="comment" class="w-full" :maxlength="500" :rows="4" :disabled="saving" aria-describedby="review-anonymous-note" placeholder="分享你的实际体验" @update:model-value="emit('update:comment', $event ?? '')" /></UFormField>
    <UCheckbox class="review-anonymous-field" label="匿名展示" :model-value="anonymous" :disabled="saving" aria-describedby="review-anonymous-note" @update:model-value="emit('update:anonymous', $event === true)" />
    <p id="review-anonymous-note" class="review-anonymous-note">匿名展示只对其他玩家隐藏身份，维护人员仍可追溯。</p>
    <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
    <div class="review-editor-actions action-row">
      <UButton type="submit" :loading="saving" :disabled="saving || comment.length > 500" :label="saving ? '保存中…' : currentReview ? '保存修改' : '提交评价'" />
      <UButton v-if="currentReview" type="button" color="neutral" variant="outline" label="撤回评价" :disabled="saving" @click="emit('withdraw')" />
    </div>
  </form>
</template>

<style scoped>
.review-editor { container-type: inline-size; display: grid; gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--line); }
.review-editor-heading { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.review-editor-heading h4 { margin: 0; color: var(--text); font-size: .9rem; }
.review-editor-heading p, .review-editor-heading > span, .review-anonymous-note { margin: var(--space-1) 0 0; color: var(--muted); font-size: .76rem; }
.review-rating-fieldset { min-width: 0; padding: 0; margin: 0; border: 0; }
.review-rating-fieldset legend { margin-bottom: var(--space-2); color: var(--text); font-size: .8rem; font-weight: 500; }
.review-rating-value { margin-left: var(--space-2); color: var(--muted); font-size: .76rem; }
.review-anonymous-field { min-height: 44px; align-items: center; }
.review-anonymous-note { margin: -0.25rem 0 0 var(--space-6); }
</style>
