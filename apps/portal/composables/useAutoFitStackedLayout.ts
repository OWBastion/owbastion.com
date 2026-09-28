export function useAutoFitStackedLayout() {
  const target = shallowRef<HTMLElement | null>(null);
  const stacked = shallowRef(false);
  let observer: ResizeObserver | null = null;

  onMounted(() => {
    const element = target.value;
    if (!element) return;

    // Read the auto-fit grid's resolved columns so layout state follows CSS sizing.
    const update = () => {
      stacked.value = getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length <= 1;
    };
    update();
    observer = new ResizeObserver(update);
    observer.observe(element);
  });

  onBeforeUnmount(() => observer?.disconnect());

  return { target, stacked };
}
