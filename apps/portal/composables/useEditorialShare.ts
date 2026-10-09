// Copy and native share for an article link; shared by the blog and changelog pages.
export function useEditorialShare(url: () => string, title: () => string) {
  const copied = shallowRef(false);
  const canNativeShare = shallowRef(false);
  let timer = 0;

  onMounted(() => { canNativeShare.value = typeof navigator.share === "function"; });
  onUnmounted(() => window.clearTimeout(timer));

  async function copyLink() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url());
      copied.value = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { copied.value = false; }, 1600);
    } catch {
      copied.value = false;
    }
  }

  async function share() {
    try {
      await navigator.share({ title: title(), url: url() });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      await copyLink();
    }
  }

  return { copied, canNativeShare, copyLink, share };
}
