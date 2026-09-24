export default defineAppConfig({
  ui: {
    colors: {
      primary: "orange",
      neutral: "stone",
      info: "sky",
      success: "green",
      warning: "amber",
      error: "red",
    },
    button: {
      slots: {
        base: "rounded-[var(--radius-control)] font-semibold",
      },
      variants: {
        size: {
          sm: {
            base: "min-h-[var(--control-sm)] px-[var(--space-3)] gap-[var(--space-2)] text-[0.8125rem] pointer-coarse:min-h-[var(--control-lg)]",
          },
          md: {
            base: "min-h-[var(--control-md)] px-[var(--space-4)] gap-[var(--space-2)] text-[0.875rem] pointer-coarse:min-h-[var(--control-lg)]",
          },
          lg: {
            base: "min-h-[var(--control-lg)] px-[var(--space-5)] gap-[var(--space-2)] text-[0.9375rem] pointer-coarse:min-h-[var(--control-lg)]",
          },
        },
      },
    },
  },
});
