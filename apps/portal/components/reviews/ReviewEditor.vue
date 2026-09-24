<script setup lang="ts">
import type { PlayerReview, ReviewRating } from "~/composables/usePlayerReview";

const props = defineProps<{
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
      <div class="review-rating-options">
        <UButton v-for="value in ratings" :key="value" class="review-rating-option" :color="rating === value ? 'primary' : 'neutral'" :variant="rating === value ? 'soft' : 'outline'" type="button" :aria-label="value + ' 星'" :aria-pressed="rating === value" @click="emit('update:rating', value)"><span aria-hidden="true">★</span><span>{{ value }} 星</span></UButton>
      </div>
    </fieldset>
    <label class="review-comment-field"><span>评价内容</span><textarea :value="comment" maxlength="500" rows="4" :disabled="saving" aria-describedby="review-anonymous-note" placeholder="分享你的实际体验" @input="emit('update:comment', ($event.target as HTMLTextAreaElement).value)"></textarea></label>
    <label class="review-anonymous-field"><input type="checkbox" :checked="anonymous" :disabled="saving" @change="emit('update:anonymous', ($event.target as HTMLInputElement).checked)" /><span>匿名展示</span></label>
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
.review-rating-fieldset legend, .review-comment-field > span { margin-bottom: var(--space-2); color: var(--text); font-size: .8rem; font-weight: 500; }
.review-rating-options { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-1); }
.review-rating-option { min-width: 0; flex-direction: column; gap: 1px; padding-inline: var(--space-1); font-size: .7rem; }
.review-rating-option span:first-child { font-size: 1rem; line-height: 1; }
.review-comment-field textarea:focus-visible, .review-anonymous-field input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.review-comment-field { display: grid; }
.review-comment-field textarea { width: 100%; min-height: 96px; padding: var(--space-2) var(--space-3); border: 1px solid var(--line-strong); border-radius: var(--radius-control); resize: vertical; color: var(--text); background: var(--surface); font: inherit; font-size: .82rem; line-height: 1.5; }
.review-comment-field textarea:disabled { cursor: not-allowed; opacity: .6; }
.review-anonymous-field { display: flex; min-height: 44px; align-items: center; gap: var(--space-2); color: var(--text); font-size: .8rem; }
.review-anonymous-field input { width: 18px; height: 18px; accent-color: var(--accent); }
.review-anonymous-note { margin: -0.25rem 0 0 var(--space-6); }
@container (max-width: 23.99rem) {
  .review-rating-option { padding-inline: 1px; font-size: .65rem; }
}
@media (prefers-contrast: more) { .review-comment-field textarea { border-color: var(--line-strong); } }
</style>
