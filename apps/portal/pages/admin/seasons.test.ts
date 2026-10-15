import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminSeason } from "@owbastion/contracts";
import SeasonsPage from "./seasons.vue";

const DAY = 86_400_000;
const now = Date.now();
const season = (id: string, name: string, startsAt: number, endsAt: number, phase: AdminSeason["phase"], overrides: Partial<AdminSeason> = {}): AdminSeason => ({
  seasonId: `00000000-0000-4000-8000-00000000000${id}`, name, startsAt, endsAt, status: phase === "draft" ? "draft" : phase === "ended" ? "archived" : "active", public: phase !== "draft", phase, playerCount: phase === "running" ? 42 : 0, createdAt: 1, updatedAt: 1, ...overrides,
});
const items = [
  season("3", "第三赛季", now + 90 * DAY, now + 180 * DAY, "draft"),
  season("2", "第二赛季", now - 30 * DAY, now + 30 * DAY, "running"),
  season("1", "第一赛季", now - 120 * DAY, now - 60 * DAY, "ended"),
];

const adminApi = vi.fn(async (path: string, options?: { method?: string }) => {
  if (path === "/v1/seasons" && !options) return { contractVersion: "1", now, items };
  if (path === "/v1/seasons") return items[0];
  if (path.endsWith("/end")) return { ...items[1], phase: "ended", status: "archived" };
  if (path.startsWith("/v1/seasons/")) return items[1];
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);
const toastAdd = vi.fn();
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));

const dialogStub = { AdminResponsiveDialog: { props: ["open", "title"], template: '<div v-if="open" role="dialog" :aria-label="title"><slot name="body" /><slot name="footer" /></div>' } };
const mountPage = async () => {
  const wrapper = await mountSuspended(SeasonsPage, { global: { stubs: dialogStub } });
  await flushPromises();
  return wrapper;
};
const button = (wrapper: Awaited<ReturnType<typeof mountPage>>, label: string) => wrapper.findAll("button").find((candidate) => candidate.text().includes(label) || candidate.attributes("aria-label") === label)!;

beforeEach(() => { adminApi.mockClear(); toastAdd.mockClear(); });

describe("admin seasons page", () => {
  it("summarises the running and next Season and flags the gap between them", async () => {
    const wrapper = await mountPage();
    const strip = wrapper.get(".strip").text();
    expect(strip).toContain("第二赛季 · 还剩 30 天");
    expect(strip).toContain("42 名玩家");
    expect(strip).toContain("第三赛季");
    expect(strip).toContain("期间排行榜只有全部时间");
    expect(wrapper.findAll(".season-row")).toHaveLength(3);
  });

  it("filters Seasons by status", async () => {
    const wrapper = await mountPage();
    await button(wrapper, "草稿").trigger("click");
    expect(wrapper.findAll(".season-row").map((row) => row.text())).toEqual([expect.stringContaining("第三赛季")]);
  });

  it("creates a draft with an idempotency key and rejects an overlapping window before saving", async () => {
    const wrapper = await mountPage();
    await button(wrapper, "新建赛季").trigger("click");
    await flushPromises();
    const [start, end] = wrapper.findAll('input[type="date"]');
    await start!.setValue("2026-01-01");
    await end!.setValue("2026-01-31");
    await flushPromises();
    expect(button(wrapper, "保存草稿").attributes("disabled")).toBeUndefined();
    await start!.setValue(new Date(now - 10 * DAY).toISOString().slice(0, 10));
    await end!.setValue(new Date(now + 10 * DAY).toISOString().slice(0, 10));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain("第二赛季");
    expect(button(wrapper, "保存草稿").attributes("disabled")).toBeDefined();
    await start!.setValue("2026-01-01");
    await end!.setValue("2026-01-31");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/seasons", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }), body: expect.objectContaining({ status: "draft", public: false }) }));
  });

  it("toggles visibility with an undo that restores the previous value", async () => {
    const wrapper = await mountPage();
    await wrapper.get('button[role="switch"][aria-label="第二赛季对玩家可见"]').trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(`/v1/seasons/${items[1]!.seasonId}`, expect.objectContaining({ method: "PUT", body: expect.objectContaining({ public: false, status: "active" }) }));
    const undo = toastAdd.mock.calls[0]![0].actions[0];
    adminApi.mockClear();
    undo.onClick();
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(`/v1/seasons/${items[1]!.seasonId}`, expect.objectContaining({ body: expect.objectContaining({ public: true }) }));
  });

  it("asks for a second click before ending a running Season early", async () => {
    const wrapper = await mountPage();
    await button(wrapper, "编辑 第二赛季").trigger("click");
    await flushPromises();
    await button(wrapper, "提前结束").trigger("click");
    expect(adminApi).not.toHaveBeenCalledWith(expect.stringContaining("/end"), expect.anything());
    await button(wrapper, "再点一次确认提前结束").trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(`/v1/seasons/${items[1]!.seasonId}/end`, expect.objectContaining({ method: "POST" }));
  });

  it("keeps an ended Season read-only apart from its visibility", async () => {
    const wrapper = await mountPage();
    await button(wrapper, "查看 第一赛季").trigger("click");
    await flushPromises();
    expect(wrapper.findAll('input[type="date"]').every((input) => input.attributes("disabled") !== undefined)).toBe(true);
    expect(wrapper.text()).not.toContain("提前结束");
  });
});
