import { computed, onMounted, toValue, type MaybeRefOrGetter } from "vue";

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
        cache.value[requestCacheKey] = data;
        if (cacheKey.value === requestCacheKey) options.onData?.(data);
        return data;
      } catch (error) {
        if (cacheKey.value === requestCacheKey) options.onError?.(error);
        throw error;
      }
    },
    {
      server: false,
      immediate: false,
      default: () => cache.value[cacheKey.value] as T,
      getCachedData: noCachedAsyncData,
    },
  );
  onMounted(() => { void asyncData.refresh(); });
  const cached = cache.value[cacheKey.value];
  if (cached !== undefined) options.onData?.(cached);

  return {
    ...asyncData,
    loading: computed(() => cache.value[cacheKey.value] === undefined && asyncData.pending.value),
  };
}
