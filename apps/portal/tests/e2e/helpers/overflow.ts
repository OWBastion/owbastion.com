import type { Page } from "playwright-core";

/**
 * Detect page-level horizontal overflow (document scrollWidth > clientWidth).
 * Ignores transient scrollbar precision by requiring a meaningful overflow.
 */
export async function hasHorizontalOverflow(page: Page, minOverflowPx = 1): Promise<boolean> {
  return page.evaluate((min) => {
    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    const clientWidth = root.clientWidth;
    return scrollWidth - clientWidth > min;
  }, minOverflowPx);
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await hasHorizontalOverflow(page);
  if (overflow) {
    const metrics = await page.evaluate(() => ({
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0),
      clientWidth: document.documentElement.clientWidth,
    }));
    throw new Error(
      `Page-level horizontal overflow: scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth}`,
    );
  }
}
