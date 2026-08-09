import { describe, expect, it } from "vitest";

import { isStudioEditorialRoute, isStudioVisibleRoute } from "./studio-route";

describe("Studio route visibility", () => {
  it.each([
    "/blog",
    "/blog/rotation-challenges-map-mastery",
    "/blog/rotation-challenges-map-mastery?preview=1",
    "/changelog",
    "/changelog/26.0801.1/",
  ])("allows editorial route %s", (path) => {
    expect(isStudioEditorialRoute(path)).toBe(true);
    expect(isStudioVisibleRoute(path)).toBe(true);
  });

  it.each([
    "/",
    "/admin",
    "/admin/players",
    "/blogger",
    "/changelogue/26.0801.1",
  ])("denies non-editorial route %s", (path) => {
    expect(isStudioEditorialRoute(path)).toBe(false);
    expect(isStudioVisibleRoute(path)).toBe(false);
  });

  it.each(["/studio", "/studio/", "/_studio"]) ("keeps standalone route %s visible", (path) => {
    expect(isStudioVisibleRoute(path)).toBe(true);
  });
});
