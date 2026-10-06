import { useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";

// Pointer-driven tilt for title icons. It only follows a fine pointer that can
// hover, never loops, and stays off under prefers-reduced-motion; touch and
// keyboard users get the static icon.
export function useIconTilt(maxDegrees = 10) {
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const reducedMotion = usePreferredReducedMotion();
  const enabled = computed(() => finePointer.value && reducedMotion.value !== "reduce");
  const style = shallowRef<Record<string, string>>({});
  const active = shallowRef(false);

  function onPointerMove(event: PointerEvent) {
    if (!enabled.value) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    active.value = true;
    style.value = {
      "--tilt-x": `${((0.5 - y) * 2 * maxDegrees).toFixed(2)}deg`,
      "--tilt-y": `${((x - 0.5) * 2 * maxDegrees).toFixed(2)}deg`,
      "--glare-x": `${(x * 100).toFixed(1)}%`,
      "--glare-y": `${(y * 100).toFixed(1)}%`,
    };
  }

  function onPointerLeave() {
    active.value = false;
    style.value = {};
  }

  return { style, active, handlers: { pointermove: onPointerMove, pointerleave: onPointerLeave, pointercancel: onPointerLeave } };
}
