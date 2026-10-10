import { computed, onMounted, toValue, watch, type MaybeRefOrGetter } from "vue";

type AdminAsyncDataOptions<T> = {
  cacheKey?: MaybeRefOrGetter<string>;
  onStart?: () => void;
  onData?: (data: T) => void;
  onError?: (error: unknown) => void;
};

const noCachedAsyncData = () => undefined;

export function useAdminAsyncData<T>(
  key: string,
  handler: () => Promise<T>,
  options: AdminAsyncDataOptions<T> = {},
) {
  const cache = useState<Record<string, T | undefined>>(`admin-page-cache:${key}`, () => ({}));
  const cacheKey = computed(() => toValue(options.cacheKey ?? "default"));
  const asyncData = useAsyncData<T>(
    computed(() => `admin-page:${key}:${cacheKey.value}`),
    async () => {
      const requestCacheKey = cacheKey.value;
      options.onStart?.();
      try {
        const data = await handler();
        if (cacheKey.value === requestCacheKey) {
          cache.value[requestCacheKey] = data;
          options.onData?.(data);
        }
        return data;
      } catch (error) {
        if (cacheKey.value === requestCacheKey) options.onError?.(error);
        throw error;
      }
    },
    {
      server: false,
      immediate: false,
      dedupe: "defer",
      default: () => cache.value[cacheKey.value] as T,
      getCachedData: noCachedAsyncData,
    },
  );

  const refresh = async () => {
    const requestCacheKey = cacheKey.value;
    try {
      await asyncData.refresh();
    } catch (error) {
      if (cacheKey.value === requestCacheKey) options.onError?.(error);
    }
  };
  onMounted(() => { void refresh(); });
  watch(cacheKey, (nextCacheKey) => {
    const cached = cache.value[nextCacheKey];
    if (cached !== undefined) options.onData?.(cached);
    else void refresh();
  }, { flush: "sync" });

  const cached = cache.value[cacheKey.value];
  if (cached !== undefined) options.onData?.(cached);

  return {
    ...asyncData,
    refresh,
    loading: computed(() => cache.value[cacheKey.value] === undefined && asyncData.pending.value),
  };
}
