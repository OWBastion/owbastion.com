import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PlayerReviewsPage from './index.vue';

const review = {
  reviewId: '00000000-0000-4000-8000-000000000003',
  targetType: 'map' as const,
  targetId: 'map.test',
  targetName: '测试地图',
  playerAccountId: '11111111-1111-4111-8111-111111111111',
  playerId: '1234',
  playerName: 'Player',
  rating: 4 as const,
  comment: '很好',
  anonymous: true,
  commentStatus: 'visible' as const,
  status: 'active' as const,
  createdAt: 1,
  updatedAt: 2,
  withdrawnAt: null,
  invalidatedAt: null,
  invalidatedBy: null,
  invalidationReason: null,
};
const detail = { contractVersion: '1' as const, review, audit: [{ operation: 'review.create', actorType: 'user', actorId: '1234', reason: null, createdAt: 1 }] };
const adminApi = vi.fn((path: string, options?: Record<string, unknown>) => {
  if (path === '/v1/reviews?page=1&pageSize=20') return Promise.resolve({ items: [review], total: 1 });
  if (path === '/v1/reviews/' + review.reviewId && !options) return Promise.resolve(detail);
  throw new Error('Unexpected request: ' + path);
});
mockNuxtImport('useAdminApi', () => () => adminApi);

describe('admin player reviews page', () => {
  it('shows maintainer identity context and explicit moderation filters', async () => {
    const wrapper = await mountSuspended(PlayerReviewsPage, {
      attachTo: document.body,
      global: {
        stubs: {
          StatusBadge: { props: ['label'], template: '<span>{{ label }}</span>' },
          AdminResponsiveDialog: { template: '<div><slot name="body" /><slot name="footer" /></div>' },
        },
      },
    });
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith('/v1/reviews?page=1&pageSize=20');
    expect(wrapper.text()).toContain('测试地图');
    expect(wrapper.text()).toContain('Player');
    expect(wrapper.text()).toContain('公开匿名');
    expect(wrapper.find('input[aria-label="按目标筛选"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="打开更多操作"]').exists()).toBe(true);
  });
});
