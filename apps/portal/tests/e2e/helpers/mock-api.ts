import type { Page } from "playwright-core";
import { url } from "@nuxt/test-utils/e2e";

export type MockAuthMode = "anonymous" | "player" | "admin";

export type MockApiOptions = {
  auth?: MockAuthMode;
  mapsFail?: boolean;
  meFail?: boolean;
  titlesFail?: boolean;
  submissionFail?: boolean;
  mapSaveFail?: boolean;
  mutationDelayMs?: number;
  submission?: unknown;
};

/**
 * Configure deterministic e2e fixtures via cookie scenario.
 * The Nitro middleware (`server/middleware/e2e-fixtures.ts`) reads this cookie
 * during SSR and browser same-origin API calls when NUXT_PORTAL_E2E_FIXTURES=1.
 */
export async function installApiMocks(page: Page, options: MockApiOptions = {}) {
  const scenario = {
    auth: options.auth ?? "anonymous",
    mapsFail: Boolean(options.mapsFail),
    meFail: Boolean(options.meFail),
    titlesFail: Boolean(options.titlesFail),
    submissionFail: Boolean(options.submissionFail),
    mapSaveFail: Boolean(options.mapSaveFail),
    mutationDelayMs: options.mutationDelayMs ?? 0,
  };
  const value = encodeURIComponent(JSON.stringify(scenario));
  const origin = new URL(url("/"));

  await page.context().addCookies([
    {
      name: "owbastion-e2e-scenario",
      value,
      domain: origin.hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  // Ensure the cookie reaches Nitro even if the browser context cookie jar misses the port.
  await page.route(`${origin.origin}/**`, async (route) => {
    const headers = {
      ...route.request().headers(),
      cookie: mergeCookie(route.request().headers().cookie, "owbastion-e2e-scenario", value),
    };
    await route.continue({ headers });
  });

  if (options.mutationDelayMs) {
    await page.route(`${origin.origin}/api/portal/v1/player/uploads/session`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, options.mutationDelayMs));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ uploadId: "upload_fixture_1", uploadUrl: "/api/portal/uploads/upload_fixture_1", submissionId: "sub_fixture_new" }),
      });
    });
    await page.route(`${origin.origin}/api/portal/v1/player/uploads/**/complete`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, options.mutationDelayMs));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ submissionId: "sub_fixture_new", status: "ocr_pending" }) });
    });
    await page.route(`${origin.origin}/api/portal/uploads/**`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, options.mutationDelayMs));
      await route.fulfill({ status: 204, body: "" });
    });
  }

  if (options.mapSaveFail) {
    await page.route(`${origin.origin}/api/admin/v1/maps/**/metadata`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "upstream_error", message: "save failed" } }),
      });
    });
  }
}

function mergeCookie(existing: string | undefined, name: string, value: string) {
  const parts = (existing ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.startsWith(`${name}=`));
  parts.push(`${name}=${value}`);
  return parts.join("; ");
}
