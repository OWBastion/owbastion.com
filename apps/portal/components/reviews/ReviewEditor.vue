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
        <button v-for="value in ratings" :key="value" class="review-rating-button" :class="{ selected: rating === value }" type="button" :aria-label="value + ' 星'" :aria-pressed="rating === value" @click="emit('update:rating', value)"><span aria-hidden="true">★</span><span>{{ value }} 星</span></button>
      </div>
    </fieldset>
    <label class="review-comment-field"><span>评价内容</span><textarea :value="comment" maxlength="500" rows="4" :disabled="saving" aria-describedby="review-anonymous-note" placeholder="分享你的实际体验" @input="emit('update:comment', ($event.target as HTMLTextAreaElement).value)"></textarea></label>
    <label class="review-anonymous-field"><input type="checkbox" :checked="anonymous" :disabled="saving" @change="emit('update:anonymous', ($event.target as HTMLInputElement).checked)" /><span>匿名展示</span></label>
    <p id="review-anonymous-note" class="review-anonymous-note">匿名展示只对其他玩家隐藏身份，维护人员仍可追溯。</p>
    <UAlert v-if="error" color="error" variant="subtle" :description="error" role="alert" />
    <div class="review-editor-actions"><button class="primary-button review-submit" type="submit" :disabled="saving || comment.length > 500"><span v-if="saving">保存中…</span><span v-else>{{ currentReview ? "保存修改" : "提交评价" }}</span></button><button v-if="currentReview" class="secondary-button review-withdraw" type="button" :disabled="saving" @click="emit('withdraw')">撤回评价</button></div>
  </form>
</template>

<style scoped>
.review-editor { display: grid; gap: 14px; padding-top: 17px; border-top: 1px solid var(--line); }.review-editor-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }.review-editor-heading h4 { margin: 0; color: var(--text); font-size: .9rem; }.review-editor-heading p, .review-editor-heading > span, .review-anonymous-note { margin: 4px 0 0; color: var(--muted); font-size: .76rem; }.review-rating-fieldset { min-width: 0; padding: 0; margin: 0; border: 0; }.review-rating-fieldset legend, .review-comment-field > span { margin-bottom: 8px; color: var(--text); font-size: .8rem; font-weight: 650; }.review-rating-options { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }.review-rating-button { display: grid; min-width: 0; min-height: 44px; place-items: center; gap: 1px; padding: 6px 4px; border: 1px solid var(--line-strong); border-radius: 8px; color: var(--muted); background: var(--surface); font: inherit; font-size: .7rem; }.review-rating-button span:first-child { color: var(--line-strong); font-size: 1rem; line-height: 1; }.review-rating-button.selected { border-color: var(--accent); color: var(--text); background: var(--accent-surface); }.review-rating-button.selected span:first-child { color: var(--accent); }.review-rating-button:focus-visible, .review-comment-field textarea:focus-visible, .review-anonymous-field input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }.review-comment-field { display: grid; }.review-comment-field textarea { width: 100%; min-height: 96px; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: 8px; resize: vertical; color: var(--text); background: var(--surface); font: inherit; font-size: .82rem; line-height: 1.5; }.review-comment-field textarea:disabled { cursor: not-allowed; opacity: .6; }.review-anonymous-field { display: flex; min-height: 44px; align-items: center; gap: 9px; color: var(--text); font-size: .8rem; }.review-anonymous-field input { width: 18px; height: 18px; accent-color: var(--accent); }.review-anonymous-note { margin: -5px 0 0 27px; }.review-editor-actions { display: flex; flex-wrap: wrap; gap: 8px; }.review-editor-actions :deep(.primary-button), .review-editor-actions :deep(.secondary-button), .review-submit, .review-withdraw { min-height: 44px; }.review-submit:disabled, .review-withdraw:disabled { cursor: not-allowed; opacity: .55; }
@media (max-width: 360px) { .review-rating-options { gap: 3px; }.review-rating-button { padding-inline: 1px; font-size: .65rem; } }
@media (prefers-contrast: more) { .review-rating-button, .review-comment-field textarea { border-color: var(--line-strong); } }
</style>
