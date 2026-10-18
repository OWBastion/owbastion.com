import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import PlayerHandlesPage from './player-handles.vue';

const row = { handleId: '00000000-0000-4000-8000-0000000000a1', playerAccountId: 'acct-1', playerName: 'Player', handle: 'newname', currentHandle: 'oldname', requestedAt: 1 };
const adminApi = vi.fn((path: string, options?: Record<string, unknown>) => {
  if (path === '/v1/player-handles?status=pending&page=1&pageSize=25') return Promise.resolve({ contractVersion: '1', status: 'pending', items: [row], page: 1, pageSize: 25, total: 1, hasMore: false });
  if (path === `/v1/player-handles/${row.handleId}/approve` && options?.method === 'POST') return Promise.resolve(undefined);
  throw new Error('Unexpected request: ' + path);
});
mockNuxtImport('useAdminApi', () => () => adminApi);

describe('admin player handles page', () => {
  it('lists pending requests and approves one without a reason', async () => {
    const wrapper = await mountSuspended(PlayerHandlesPage, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.text()).toContain('newname');
    expect(wrapper.text()).toContain('oldname');
    const approve = wrapper.findAll('button').find((button) => button.text() === '通过');
    await approve!.trigger('click');
    await flushPromises();

    const call = adminApi.mock.calls.find(([path]) => String(path).endsWith('/approve'))!;
    expect(call[1]).toMatchObject({ method: 'POST', headers: { 'Idempotency-Key': expect.any(String) } });
    expect(call[1]).not.toHaveProperty('body');
    expect(wrapper.text()).toContain('已通过「newname」');
  });
});
