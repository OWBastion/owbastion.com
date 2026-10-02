import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminServiceTokenManager from './AdminServiceTokenManager.vue';

const { api, clipboard } = vi.hoisted(() => ({ api: vi.fn(), clipboard: vi.fn() }));
mockNuxtImport('useAdminApi', () => () => api);
const configuredStatus = { serviceId: 'ocrkit-screenshot-sets', configured: true, updatedAt: 1 };
const dialog = defineComponent({
  props: ['open', 'title'],
  setup(props, { slots }) { return () => props.open ? h('div', { role: 'dialog' }, [props.title, slots.body?.(), slots.footer?.()]) : null; },
});
const mounted: Awaited<ReturnType<typeof mountSuspended>>[] = [];
async function mountManager() {
  const wrapper = await mountSuspended(AdminServiceTokenManager, { global: { stubs: { AdminResponsiveDialog: dialog } } });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}
async function click(wrapper: Awaited<ReturnType<typeof mountManager>>, text: string) {
  const button = wrapper.findAll('button').find((element) => element.text().trim() === text);
  expect(button, text).toBeDefined();
  await button!.trigger('click');
  await flushPromises();
}

beforeEach(() => {
  api.mockReset().mockImplementation((path: string, options?: { method: string; body: { token: string | null } }) => {
    if (!options) return Promise.resolve({ contractVersion: '1', items: [configuredStatus] });
    return Promise.resolve({ ...configuredStatus, configured: options.body.token !== null });
  });
  clipboard.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } });
});
afterEach(() => { mounted.splice(0).forEach((wrapper) => wrapper.unmount()); });

describe('internal service credential management', () => {
  it('generates a draft only on demand, activates after confirmation, and clears one-time plaintext', async () => {
    const wrapper = await mountManager();
    expect((wrapper.get('input[aria-label="新凭据"]').element as HTMLInputElement).value).toBe('');
    expect(wrapper.find('input[aria-label="本次保存的凭据"]').exists()).toBe(false);
    await click(wrapper, '生成新凭据');
    const token = (wrapper.get('input[aria-label="新凭据"]').element as HTMLInputElement).value;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(api.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
    await click(wrapper, '复制草稿');
    expect(clipboard).toHaveBeenCalledWith(token);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').text()).toContain('替换当前凭据');
    await click(wrapper, '确认保存');
    expect(api).toHaveBeenCalledWith('/v1/service-tokens/ocrkit-screenshot-sets', expect.objectContaining({ method: 'PUT', headers: { 'Idempotency-Key': expect.any(String) }, body: { contractVersion: '1', token } }));
    expect((wrapper.get('input[aria-label="本次保存的凭据"]').element as HTMLInputElement).value).toBe(token);
    await click(wrapper, '关闭明文');
    expect(wrapper.find('input[aria-label="本次保存的凭据"]').exists()).toBe(false);
  });

  it('keeps the draft when save fails and requires a refreshed status after an incomplete write', async () => {
    const wrapper = await mountManager();
    const token = 'draft-token-'.repeat(4);
    await wrapper.get('input[aria-label="新凭据"]').setValue(token);
    api.mockRejectedValueOnce({ data: { error: { code: 'SERVICE_TOKEN_WRITE_INCOMPLETE', message: 'write incomplete' } } });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await click(wrapper, '确认保存');
    expect((wrapper.get('input[aria-label="新凭据"]').element as HTMLInputElement).value).toBe(token);
    expect(wrapper.text()).toContain('先刷新状态');
    expect(wrapper.findAll('button').find((button) => button.text() === '保存凭据')!.attributes('disabled')).toBeDefined();
    await click(wrapper, '刷新状态');
    expect(wrapper.findAll('button').find((button) => button.text() === '保存凭据')!.attributes('disabled')).toBeUndefined();
  });


  it('preserves a manually supplied draft on a confirmed rejection and cannot recover plaintext after remount', async () => {
    const wrapper = await mountManager();
    const token = 'manual-credential-'.repeat(3);
    await wrapper.get('input[aria-label="新凭据"]').setValue(token);
    api.mockRejectedValueOnce({ statusCode: 400, data: { error: { code: 'VALIDATION_ERROR', message: 'invalid request' } } });
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await click(wrapper, '确认保存');
    expect((wrapper.get('input[aria-label="新凭据"]').element as HTMLInputElement).value).toBe(token);
    expect(wrapper.text()).toContain('invalid request');
    await click(wrapper, '取消');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await click(wrapper, '确认保存');
    wrapper.unmount();
    const reopened = await mountManager();
    expect(reopened.find('input[aria-label="本次保存的凭据"]').exists()).toBe(false);
    expect((reopened.get('input[aria-label="新凭据"]').element as HTMLInputElement).value).toBe('');
  });


  it.each([
    ['transport timeout', new Error('request timed out')],
    ['server failure', { statusCode: 500, data: { error: { code: 'INTERNAL_ERROR', message: 'server error' } } }],
    ['upstream failure', { statusCode: 502 }],
    ['store unavailable', { statusCode: 503, data: { error: { code: 'SERVICE_TOKEN_STORE_UNAVAILABLE' } } }],
  ])('requires a status refresh after %s without discarding the draft', async (_name, failure) => {
    const wrapper = await mountManager();
    const token = 'unknown-write-token-'.repeat(3);
    await wrapper.get('input[aria-label="新凭据"]').setValue(token);
    api.mockRejectedValueOnce(failure);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    await click(wrapper, '确认保存');
    expect(wrapper.text()).toContain('无法确认服务凭据是否已保存');
    expect((wrapper.get('input[aria-label="新凭据"]').element as HTMLInputElement).value).toBe(token);
    expect(wrapper.findAll('button').find((button) => button.text() === '保存凭据')!.attributes('disabled')).toBeDefined();
    expect(wrapper.findAll('button').find((button) => button.text() === '停用凭据')!.attributes('disabled')).toBeDefined();
    await click(wrapper, '刷新状态');
    expect(wrapper.findAll('button').find((button) => button.text() === '保存凭据')!.attributes('disabled')).toBeUndefined();
  });

  it('does not disable until confirmed, sends null, and removes plaintext', async () => {
    const wrapper = await mountManager();
    await click(wrapper, '生成新凭据');
    await click(wrapper, '停用凭据');
    expect(api.mock.calls.some(([, options]) => options?.method === 'PUT')).toBe(false);
    await click(wrapper, '确认停用');
    expect(api).toHaveBeenCalledWith('/v1/service-tokens/ocrkit-screenshot-sets', expect.objectContaining({ body: { contractVersion: '1', token: null } }));
    expect((wrapper.get('input[aria-label="新凭据"]').element as HTMLInputElement).value).toBe('');
    expect(wrapper.text()).toContain('未配置');
  });
});
