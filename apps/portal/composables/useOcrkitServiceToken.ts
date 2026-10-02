import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { createRequestId } from '~/utils/request-id';
import { portalErrorDetails } from '~/utils/portal-error';

type ServiceTokenStatus = { serviceId: 'ocrkit-screenshot-sets'; configured: boolean; updatedAt: number | null };

export function useOcrkitServiceToken() {
  const api = useAdminApi();
  const status = shallowRef<ServiceTokenStatus | null>(null);
  const draft = shallowRef('');
  const savedToken = shallowRef('');
  const loading = shallowRef(false);
  const saving = shallowRef(false);
  const errorMessage = shallowRef('');
  const feedback = shallowRef('');
  const refreshRequired = shallowRef(false);
  const validDraft = computed(() => /^[A-Za-z0-9_-]{32,256}$/.test(draft.value));
  const canSave = computed(() => validDraft.value && !!status.value && !saving.value && !loading.value && !refreshRequired.value);

  function clearSecret() { draft.value = ''; savedToken.value = ''; }

  async function refresh() {
    if (loading.value || saving.value) return;
    loading.value = true;
    errorMessage.value = '';
    try {
      const response = await api<{ contractVersion: '1'; items: ServiceTokenStatus[] }>('/v1/service-tokens');
      status.value = response.items.find((item) => item.serviceId === 'ocrkit-screenshot-sets') ?? null;
      refreshRequired.value = false;
    } catch (error) {
      errorMessage.value = portalErrorDetails(error, '无法读取服务凭据，请刷新重试。').description;
    } finally { loading.value = false; }
  }

  function generate() {
    if (saving.value) return;
    savedToken.value = '';
    feedback.value = '';
    draft.value = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function write(token: string | null) {
    if (saving.value || loading.value || refreshRequired.value || !status.value) return false;
    if (token !== null && !validDraft.value) return false;
    saving.value = true;
    errorMessage.value = '';
    feedback.value = '';
    try {
      status.value = await api<ServiceTokenStatus>('/v1/service-tokens/ocrkit-screenshot-sets', {
        method: 'PUT', headers: { 'Idempotency-Key': createRequestId() }, body: { contractVersion: '1', token },
      });
      savedToken.value = token ?? '';
      draft.value = '';
      feedback.value = token === null ? '已保存停用设置。' : '已保存凭据。';
      return true;
    } catch (error) {
      const details = portalErrorDetails(error, '服务凭据保存失败，请重试。');
      const confirmedRejection = details.statusCode !== undefined && details.statusCode >= 400 && details.statusCode < 500;
      refreshRequired.value = details.code === 'SERVICE_TOKEN_WRITE_INCOMPLETE' || !confirmedRejection;
      errorMessage.value = refreshRequired.value ? '无法确认服务凭据是否已保存，请先刷新状态，再决定是否重新保存。' : details.description;
      return false;
    } finally { saving.value = false; }
  }

  async function copy(token: string) {
    if (!token) return;
    try { await navigator.clipboard.writeText(token); feedback.value = '已复制凭据。'; }
    catch { errorMessage.value = '无法复制凭据，请手动复制。'; }
  }

  onMounted(() => { void refresh(); });
  onBeforeUnmount(clearSecret);
  return { status, draft, savedToken, loading, saving, errorMessage, feedback, refreshRequired, validDraft, canSave, refresh, generate, write, copy, clearSecret };
}
