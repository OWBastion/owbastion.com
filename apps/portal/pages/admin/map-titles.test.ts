import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { describe, expect, it, vi } from "vitest";
import MapTitlesPage from "./map-titles.vue";

const navigateTo = vi.hoisted(() => vi.fn());
mockNuxtImport("navigateTo", () => navigateTo);

describe("legacy map title rule route", () => {
  it("redirects the old deep link to the unified map achievement workspace", async () => {
    await mountSuspended(MapTitlesPage);
    expect(navigateTo).toHaveBeenCalledWith({ path: "/admin/achievements", query: { section: "map" } }, { redirectCode: 302 });
  });
});
