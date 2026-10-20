import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reactive, ref } from "vue";
import ChallengesPage from "./challenges.vue";
import MapChallengesPage from "./map-challenges.vue";
import TitlesPage from "./titles.vue";
import LegacyIndexPage from "./index.vue";
import { adminChallengeUpdateRequestSchema } from "@owbastion/contracts";
import { DEFAULT_EVIDENCE_RULE } from "~/components/admin/admin-achievement-types";

const titleSummary = {
  titleKey: "FLAWLESS",
  label: "守望先锋",
  icon: "trophy",
  iconUrl: null,
  category: "战绩",
  scope: "global",
  displayKind: "fixed",
  color: null,
  publicVisibility: true,
  lifecycle: "active",
  gameVersion: "26.0301.1",
  developerOnly: false,
  status: "active",
  acquisition: { kind: "challenges", challengeCount: 2, completableCount: 1 },
};
const draftSummary = {
  ...titleSummary,
  titleKey: "LIGHT_LOADOUT",
  label: "轻装上阵",
  lifecycle: "draft",
  status: "draft",
  acquisition: { kind: "challenges", challengeCount: 1, completableCount: 0 },
};
const mapRuleSummary = {
  ...titleSummary,
  titleKey: "CONQUEROR",
  label: "征服者",
  scope: "map",
  displayKind: "map_name_suffix",
  acquisition: { kind: "map_rule", ruleId: "rule.conqueror", condition: "通关对应地图传奇难度。", scopeLabel: "适用于所有地图的默认版本" },
};
const endedSummary = {
  ...titleSummary,
  titleKey: "LUCKY",
  label: "福星高照",
  status: "ended",
  acquisition: { kind: "none" },
};
const lapsedSummary = {
  ...titleSummary,
  titleKey: "LAPSED",
  label: "到此一游",
  status: "ended",
  acquisition: { kind: "challenges", challengeCount: 1, completableCount: 0 },
};
const summaries = [titleSummary, draftSummary, mapRuleSummary, endedSummary, lapsedSummary];
let summariesOverride: unknown[] | null = null;
let pendingList = false;
let listError = false;
let failLifecycleFor: string | null = null;
const stateCache = new Map<string, unknown>();
const asyncDataCache = new Map<string, unknown>();
// useState/useAsyncData caches persist across mounts inside one test file; keep
// per-mount maps so mock changes are not shadowed by a previous mount's data.
mockNuxtImport("useState", () => <T>(key: string, init: () => T) => {
  if (!stateCache.has(key)) stateCache.set(key, init());
  return { get value() { return stateCache.get(key) as T; }, set value(next: T) { stateCache.set(key, next); } };
});
mockNuxtImport("useAsyncData", () => <T>(key: unknown, handler: () => Promise<T>, options: { default?: () => T } = {}) => {
  const resolvedKey = typeof key === "object" && key !== null && "value" in key ? String((key as { value: unknown }).value) : String(key);
  const pending = ref(false);
  const data = ref<T | undefined>(asyncDataCache.get(resolvedKey) as T | undefined ?? options.default?.());
  const refresh = async () => {
    pending.value = true;
    try {
      const result = await handler();
      asyncDataCache.set(resolvedKey, result);
      data.value = result;
      return result;
    } finally {
      pending.value = false;
    }
  };
  return { data, pending, refresh, execute: refresh };
});

const activeChallenge = {
  challengeId: "ch-1",
  titleKey: "FLAWLESS",
  condition: "传奇及以上难度，通关时间 < 1 小时 30 分钟。",
  evidenceRule: "完整截图",
  submissionMode: "manual",
  categoryOverride: null,
  status: "active",
  startsAt: null,
  endsAt: null,
  introducedVersion: "26.0301.1",
  retiredVersion: null,
  mapIds: [],
  replacedByChallengeId: null,
};
const archivedChallenge = {
  ...activeChallenge,
  challengeId: "ch-2",
  condition: "地狱及以上难度，通关时间 < 1 小时 45 分钟。",
  status: "archived",
};
const draftChallenge = { ...activeChallenge, challengeId: "ch-3", titleKey: "LIGHT_LOADOUT", status: "draft" };
const sunsettingChallenge = { ...activeChallenge, challengeId: "ch-sun", retiredVersion: "26.1101.1" };
const scheduledChallenge = { ...activeChallenge, challengeId: "ch-sched", startsAt: Date.now() + 86_400_000 };

const map = { challengeId: "map-1", family: "map", gameplayRevisionId: "revision:map.kings-row:initial", type: "map_completion", name: "国王大道挑战", mapId: "map.kings-row", mapName: "国王大道", difficulty: "困难", condition: "完成国王大道挑战。", evidenceRule: "完整截图", submissionMode: "manual", status: "active", gameVersion: "3.0.0", introducedVersion: "3.0.0", retiredVersion: null };
const mapRule = { ruleId: "rule.conqueror", titleKey: "CONQUEROR", titleName: "征服者", kind: "conqueror", condition: "完成地图", evidenceRule: "完整截图", submissionMode: "manual", displayKind: "map_name_suffix", slot: "conqueror", defaultScope: "all_active", status: "active", introducedVersion: "3.1.0", retiredVersion: null };
const mapInheritance = { mapId: "map.kings-row", rule: mapRule, projected: true, source: "map_title_rule", effective: { condition: "完成地图", evidenceRule: "完整截图", submissionMode: "manual", slot: "conqueror" }, exception: null };

const challengeLists: Record<string, unknown[]> = {};
const defaultChallengeLists: Record<string, unknown[]> = {
  FLAWLESS: [activeChallenge, archivedChallenge],
  LIGHT_LOADOUT: [draftChallenge],
  CONQUEROR: [],
  LUCKY: [],
};
Object.assign(challengeLists, defaultChallengeLists);

const adminApiBase = (path: string, options?: { method?: string; body?: Record<string, unknown> }) => {
  if (path === "/v1/title-summaries") {
    if (pendingList) return new Promise(() => {});
    if (listError) {
      const failure = new Error("Request failed") as Error & { data?: unknown; statusCode?: number };
      failure.statusCode = 503;
      failure.data = { contractVersion: "1", error: { code: "UPSTREAM_UNAVAILABLE", message: "服务暂时不可用，请稍后重试。", requestId: "req-err" } };
      return Promise.reject(failure);
    }
    return Promise.resolve({ items: (summariesOverride ?? summaries).map((item) => ({ ...(item as object) })) });
  }
  if (path === "/v1/achievements") return Promise.resolve({ items: [{ ...map }] });
  if (path === "/v1/maps") return Promise.resolve({ items: [{ mapId: "map.kings-row", mapName: "国王大道" }, { mapId: "map.route-66", mapName: "66号公路" }] });
  if (path === "/v1/standalone-modes") return Promise.resolve({ items: [{ mode: "2026镜中回响", mapIds: ["map.kings-row", "map.route-66"] }] });
  if (path === "/v1/map-title-rules") return Promise.resolve({ items: [mapRule] });
  if (path === "/v1/map-title-rules/rule.conqueror" && options?.method === "PUT") return Promise.resolve({ ...mapRule, ...options.body });
  if (path === "/v1/maps/map.kings-row/map-title-inheritance") return Promise.resolve({ items: [mapInheritance] });
  if (path === "/v1/maps/map.route-66/map-title-inheritance") return Promise.resolve({ items: [] });
  if (path === "/v1/maps/map.kings-row/map-title-rules/rule.conqueror/exception" && options?.method === "PUT") return Promise.resolve();
  const challengesMatch = path.match(/^\/v1\/titles\/([^/]+)\/challenges$/);
  if (failLifecycleFor && path === `/v1/achievements/${failLifecycleFor}/lifecycle` && options?.method === "PUT") return Promise.reject(new Error("Request failed"));
  if (challengesMatch && !options?.method) return Promise.resolve({ items: challengeLists[challengesMatch[1]!] ?? [] });
  if (challengesMatch && options?.method === "POST") return Promise.resolve({ ...activeChallenge, challengeId: "ch-new", titleKey: challengesMatch[1], condition: String(options.body?.condition ?? "") });
  if (path === "/v1/achievements/ch-1/lifecycle" && options?.method === "PUT") {
    return Promise.resolve({ contractVersion: "1", challenge: { ...activeChallenge, status: options.body?.status, retiredVersion: options.body?.retiredVersion ?? null }, previous: { status: "active", retiredVersion: null, startsAt: null, endsAt: null } });
  }
  if (path === "/v1/achievements/ch-2/lifecycle" && options?.method === "PUT") {
    return Promise.resolve({ contractVersion: "1", challenge: { ...archivedChallenge, status: options.body?.status }, previous: { status: "archived", retiredVersion: null, startsAt: null, endsAt: null } });
  }
  if (path === "/v1/achievements/ch-3/lifecycle" && options?.method === "PUT") {
    return Promise.resolve({ contractVersion: "1", challenge: { ...draftChallenge, status: options.body?.status }, previous: { status: "draft", retiredVersion: null, startsAt: null, endsAt: null } });
  }
  if (path === "/v1/achievements/ch-1" && options?.method === "PUT") return Promise.resolve({ ...activeChallenge, ...options.body });
  if (path === "/v1/achievements/ch-2" && options?.method === "PUT") return Promise.resolve({ ...archivedChallenge, ...options.body });
  if (path === "/v1/achievements/ch-sun/lifecycle" && options?.method === "PUT") {
    return Promise.resolve({ contractVersion: "1", challenge: { ...sunsettingChallenge, status: options.body?.status }, previous: { status: "active", retiredVersion: "26.1101.1", startsAt: null, endsAt: null } });
  }
  if (path === "/v1/achievements/ch-sched/lifecycle" && options?.method === "PUT") {
    return Promise.resolve({ contractVersion: "1", challenge: { ...scheduledChallenge, status: options.body?.status }, previous: { status: "active", retiredVersion: null, startsAt: scheduledChallenge.startsAt, endsAt: null } });
  }
  if (path === "/v1/achievements/ch-sun" && options?.method === "PUT") return Promise.resolve({ ...sunsettingChallenge, ...options.body });
  if (path === "/v1/achievements/map-1" && options?.method === "PUT") return Promise.resolve({ ...map, ...options.body });
  const titleMatch = path.match(/^\/v1\/titles\/([^/]+)$/);
  if (titleMatch && options?.method === "PUT") {
    const before = summaries.find((item) => item.titleKey === titleMatch[1])!;
    return Promise.resolve({
      contractVersion: "1",
      title: { ...before, lifecycle: options.body?.lifecycle ?? before.lifecycle },
      previousLifecycle: before.lifecycle,
    });
  }
  if (path === "/v1/titles" && options?.method === "POST") {
    return Promise.resolve({ ...titleSummary, titleKey: String(options.body?.titleKey ?? "GENERATED"), label: String(options.body?.label ?? ""), lifecycle: "draft", status: "draft", acquisition: { kind: "none" } });
  }
  throw new Error(`Unexpected request: ${path}`);
};
const adminApi = vi.fn(adminApiBase);
mockNuxtImport("useAdminApi", () => () => adminApi);
const toastAdd = vi.fn();
mockNuxtImport("useToast", () => () => ({ add: toastAdd }));
mockNuxtImport("useCurrentPlayer", () => () => ({ player: ref({ player: { isAdmin: true } }), status: ref("authenticated"), refresh: vi.fn() }));
const navigateTo = vi.hoisted(() => vi.fn());
mockNuxtImport("navigateTo", () => navigateTo);
const route = reactive({ path: "/admin/achievements", query: {} as Record<string, string> });
mockNuxtImport("useRoute", () => () => route);
const mountedWrappers: VueWrapper[] = [];

const pages = { challenges: ChallengesPage, map: MapChallengesPage, titles: TitlesPage };

async function mountPage(page: keyof typeof pages = "titles", options: { summaries?: unknown[] | null; pending?: boolean; error?: boolean } = {}): Promise<VueWrapper> {
  adminApi.mockReset();
  adminApi.mockImplementation(adminApiBase);
  toastAdd.mockClear();
  stateCache.clear();
  asyncDataCache.clear();
  summariesOverride = options.summaries ?? null;
  pendingList = options.pending ?? false;
  listError = options.error ?? false;
  route.path = `/admin/achievements/${page === "map" ? "map-challenges" : page}`;
  route.query = {};
  const wrapper = await mountSuspended(pages[page], {
    attachTo: document.body,
    global: {
      stubs: {
        NuxtLink: { template: "<a><slot /></a>" },
        StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
        UModal: { props: ["open"], emits: ["update:open"], template: '<div v-if="open" role="dialog"><slot name="body" /><slot name="footer" /></div>' },
        UPopover: { props: ["open"], emits: ["update:open"], template: '<div><slot /><slot name="content" /></div>' },
        UCard: { template: "<div><slot /></div>" },
        UTabs: {
          props: ["modelValue", "items"],
          emits: ["update:modelValue"],
          template: '<div><button v-for="item in items" :key="item.value" type="button" :aria-label="item.label" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button><slot :name="modelValue" /></div>',
        },
        USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' },
      },
    },
  });
  await flushPromises();
  mountedWrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
  summariesOverride = null;
  pendingList = false;
  listError = false;
  failLifecycleFor = null;
  stateCache.clear();
  asyncDataCache.clear();
  for (const key of Object.keys(challengeLists)) delete challengeLists[key];
  Object.assign(challengeLists, defaultChallengeLists);
});

async function expand(wrapper: VueWrapper, label: string) {
  await wrapper.get(`button[aria-label="展开${label}的获取方式"]`).trigger("click");
  await flushPromises();
}

describe("achievement admin pages", () => {
  it("sanity renders the standard list", async () => {
    const wrapper = await mountPage("titles");
    expect(wrapper.text()).toContain("守望先锋");
  });


  it("renders titles with their acquisition summaries and statuses", async () => {
    const wrapper = await mountPage("titles");
    expect(wrapper.text()).toContain("守望先锋");
    expect(wrapper.text()).toContain("2 条挑战 · 1 条可完成");
    expect(wrapper.text()).toContain("地图称号规则");
    expect(wrapper.text()).toContain("无获取方式");
    expect(wrapper.text()).toContain("已结束");
    expect(wrapper.text()).toContain("轻装上阵");
  });

  it("expands a title and lists its challenges with actions", async () => {
    const wrapper = await mountPage("titles");
    await expand(wrapper, "守望先锋");
    expect(adminApi).toHaveBeenCalledWith("/v1/titles/FLAWLESS/challenges");
    expect(wrapper.text()).toContain("传奇及以上难度");
    expect(wrapper.text()).toContain("长期开放");
    expect(wrapper.text()).toContain("引入 26.0301.1");
    expect(wrapper.findAll('button[aria-label="计划下线守望先锋的挑战"]')).toHaveLength(1);
    expect(wrapper.findAll('button[aria-label="结束守望先锋的挑战"]')).toHaveLength(1);
    expect(wrapper.findAll('button[aria-label="重开守望先锋的挑战"]')).toHaveLength(1);
  });

  it("shows the map-rule card for rule-managed titles and links to map challenges", async () => {
    const wrapper = await mountPage("titles");
    await expand(wrapper, "征服者");
    expect(adminApi.mock.calls.some(([path]) => path === "/v1/titles/CONQUEROR/challenges")).toBe(false);
    expect(wrapper.text()).toContain("通关对应地图传奇难度。");
    expect(wrapper.text()).toContain("由地图称号规则发放 · 适用于所有地图的默认版本");
    expect(wrapper.findAll("a").some((link) => link.text() === "在地图挑战中管理")).toBe(true);
  });

  it("shows the empty acquisition card for ended titles without challenges", async () => {
    const wrapper = await mountPage("titles");
    await expand(wrapper, "福星高照");
    expect(wrapper.text()).toContain("还没有获取方式，玩家无法获得这个称号。");
    expect(wrapper.findAll("button").some((button) => button.text() === "添加挑战")).toBe(true);
  });

  it("shows the empty acquisition card for titles without challenges", async () => {
    const once = adminApi.getMockImplementation()!;
    const wrapper = await mountPage("titles", { summaries: [{ ...titleSummary, acquisition: { kind: "none" } }] });
    await expand(wrapper, "守望先锋");
    expect(wrapper.text()).toContain("还没有获取方式，玩家无法获得这个称号。");
    expect(wrapper.findAll("button").some((button) => button.text() === "添加第一条挑战")).toBe(true);
  });

  it("navigates grants with the title preselected", async () => {
    const wrapper = await mountPage("titles");
    const grant = wrapper.findAll("a").find((link) => link.text() === "发放");
    expect(grant).toBeTruthy();
  });

  it("shows the loading skeleton while the list request is pending", async () => {
    stateCache.clear();
    pendingList = true;
    const loadingWrapper = await mountSuspended(TitlesPage, {
      attachTo: document.body,
      global: { stubs: { NuxtLink: { template: "<a><slot /></a>" }, StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" } } },
    });
    await flushPromises();
    expect(loadingWrapper.text()).toContain("读取中…");
    loadingWrapper.unmount();
  });

  it("shows the empty state with a create action", async () => {
    const wrapper = await mountPage("titles", { summaries: [] });
    expect(wrapper.text()).toContain("还没有称号");
    expect(wrapper.findAll("button").some((button) => button.text() === "新建第一个称号")).toBe(true);
  });

  it("shows the filter-empty state and clears the filters", async () => {
    const wrapper = await mountPage("titles");
    await wrapper.get('input[aria-label="搜索称号或完成条件"]').setValue("不存在的称号");
    await flushPromises();
    expect(wrapper.text()).toContain("没有符合条件的称号");
    const clear = wrapper.findAll("button").find((button) => button.text() === "清除筛选")!;
    await clear.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("守望先锋");
  });

  it("shows the error state and retries", async () => {
    const wrapper = await mountPage("titles", { error: true });
    expect(wrapper.text()).toContain("无法读取称号");
    expect(wrapper.text()).toContain("服务暂时不可用，请稍后重试。");
    listError = false;
    await wrapper.findAll("button").find((button) => button.text() === "重试")!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("守望先锋");
  });

  it("links the two sections and marks the current one", async () => {
    const wrapper = await mountPage("titles");
    const nav = wrapper.get('nav[aria-label="称号与挑战"]');
    expect(nav.findAll("a").map((link) => link.text())).toEqual(["称号", "地图挑战"]);
    expect(nav.get('[aria-current="page"]').text()).toBe("称号");
  });

  it.each([
    [{ section: "catalog" }, "/admin/achievements/titles", {}],
    [{ section: "map", mapId: "map.kings-row", ruleId: "rule.conqueror" }, "/admin/achievements/map-challenges", { mapId: "map.kings-row", ruleId: "rule.conqueror" }],
    [{ section: "generic" }, "/admin/achievements/titles", {}],
    [{}, "/admin/achievements/titles", {}],
    [{ x: "1" }, "/admin/achievements/titles", { x: "1" }],
  ])("redirects legacy deep link %j", async (query, path, carried) => {
    navigateTo.mockClear();
    route.query = query as Record<string, string>;
    await mountSuspended(LegacyIndexPage);
    expect(navigateTo).toHaveBeenCalledWith({ path, query: carried }, expect.objectContaining({ redirectCode: 302 }));
  });

  it("redirects the old challenges URL preserving query params", async () => {
    navigateTo.mockClear();
    route.query = { x: "1" };
    await mountSuspended(ChallengesPage);
    expect(navigateTo).toHaveBeenCalledWith({ path: "/admin/achievements/titles", query: { x: "1" } }, expect.objectContaining({ redirectCode: 302 }));
  });

  it("offers no 结束 button for a title whose acquisition window already lapsed", async () => {
    const wrapper = await mountPage("titles");
    expect(wrapper.text()).toContain("到此一游");
    expect(wrapper.find('button[aria-label="结束到此一游"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="重开到此一游"]').exists()).toBe(false);
    expect(wrapper.find('a[aria-label="发放到此一游"], [aria-label="发放到此一游"]').exists()).toBe(true);
  });

  it("ends a title by ending every open challenge and undoes each one", async () => {
    const wrapper = await mountPage("titles");
    await wrapper.get('button[aria-label="结束守望先锋"]').trigger("click");
    await flushPromises();
    // The title-level end composes per-challenge lifecycle calls; nothing
    // writes a stored retired lifecycle to the title row.
    const ended = adminApi.mock.calls.filter(([path, options]) => path === "/v1/achievements/ch-1/lifecycle" && options?.method === "PUT");
    expect(ended).toHaveLength(1);
    expect(ended[0]?.[1]?.body).toEqual(expect.objectContaining({ contractVersion: "1", status: "archived" }));
    expect(adminApi.mock.calls.some(([path, options]) => path === "/v1/titles/FLAWLESS" && options?.method === "PUT")).toBe(false);
    const toastEntry = toastAdd.mock.calls.find(([entry]) => entry.title === "已结束「守望先锋」");
    expect(toastEntry?.[0]?.actions?.[0]?.label).toBe("撤销");
    adminApi.mockClear();
    toastEntry![0].actions[0].onClick();
    await flushPromises();
    const undo = adminApi.mock.calls.find(([path, options]) => path === "/v1/achievements/ch-1/lifecycle" && options?.method === "PUT");
    expect(undo?.[1]?.body).toEqual(expect.objectContaining({
      contractVersion: "1",
      status: "active",
      retiredVersion: null,
      startsAt: null,
      endsAt: null,
    }));
  });

  it("ends scheduled acquisition paths as well as open ones", async () => {
    challengeLists.FLAWLESS = [activeChallenge, scheduledChallenge];
    const wrapper = await mountPage("titles");
    await wrapper.get('button[aria-label="结束守望先锋"]').trigger("click");
    await flushPromises();
    const ended = adminApi.mock.calls.filter(([path, options]) => path.endsWith("/lifecycle") && options?.method === "PUT" && options.body?.status === "archived").map(([path]) => path);
    expect(ended.sort()).toEqual(["/v1/achievements/ch-1/lifecycle", "/v1/achievements/ch-sched/lifecycle"]);
    const toastEntry = toastAdd.mock.calls.find(([entry]) => entry.title === "已结束「守望先锋」");
    expect(toastEntry?.[0]?.actions?.[0]?.label).toBe("撤销");
    adminApi.mockClear();
    toastEntry![0].actions[0].onClick();
    await flushPromises();
    const restores = adminApi.mock.calls.filter(([path, options]) => path.endsWith("/lifecycle") && options?.method === "PUT");
    expect(restores.map(([path]) => path).sort()).toEqual(["/v1/achievements/ch-1/lifecycle", "/v1/achievements/ch-sched/lifecycle"]);
    expect(restores.find(([path]) => path === "/v1/achievements/ch-sched/lifecycle")?.[1]?.body).toEqual(expect.objectContaining({
      status: "active",
      startsAt: scheduledChallenge.startsAt,
    }));
  });

  it("surfaces a partial failure when ending a title and does not claim success", async () => {
    challengeLists.FLAWLESS = [activeChallenge, sunsettingChallenge];
    failLifecycleFor = "ch-sun";
    const wrapper = await mountPage("titles");
    await wrapper.get('button[aria-label="结束守望先锋"]').trigger("click");
    await flushPromises();
    // ch-1 was ended, ch-sun failed: the error surfaces, the list reloads, and
    // no success toast is shown.
    expect(adminApi.mock.calls.filter(([path, options]) => path.endsWith("/lifecycle") && options?.method === "PUT")).toHaveLength(2);
    expect(toastAdd.mock.calls.some(([entry]) => entry.title === "已结束「守望先锋」")).toBe(false);
    expect(wrapper.text()).toContain("Request failed");
  });

  it("offers 同时启用称号 when adding an active challenge to a draft title", async () => {
    const wrapper = await mountPage("titles");
    await expand(wrapper, "轻装上阵");
    await wrapper.findAll("button").find((button) => button.text() === "添加挑战")!.trigger("click");
    await flushPromises();
    const form = wrapper.get("form#admin-challenge-form");
    const statusSelect = form.findAll("select").find((select) => select.text().includes("草稿") && select.text().includes("已开放"))!;
    await statusSelect.setValue("active");
    await flushPromises();
    expect(form.text()).toContain("同时启用称号「轻装上阵」");
    await form.findAll("textarea")[0]!.setValue("完成条件");
    await form.trigger("submit");
    await flushPromises();
    const call = adminApi.mock.calls.find(([path, options]) => path === "/v1/titles/LIGHT_LOADOUT/challenges" && options?.method === "POST");
    expect(call?.[1]?.body).toEqual(expect.objectContaining({ contractVersion: "1", enableTitle: true, status: "active", evidenceRule: DEFAULT_EVIDENCE_RULE }));
  });

  it("sends saveMode new_challenge when qualification changes", async () => {
    const wrapper = await mountPage("titles");
    await expand(wrapper, "守望先锋");
    await wrapper.get('button[aria-label="编辑守望先锋的挑战"]').trigger("click");
    await flushPromises();
    const form = wrapper.get("form#admin-challenge-form");
    expect(wrapper.text()).not.toContain("保存为新挑战");
    await form.findAll("select")[0]!.setValue("required_maps_completed");
    await flushPromises();
    expect(wrapper.text()).toContain("保存后会新建一条挑战");
    const mapSelect = form.findAll("select").find((select) => select.attributes("multiple") !== undefined)!;
    await mapSelect.setValue(["map.kings-row"]);
    await form.trigger("submit");
    await flushPromises();
    const call = adminApi.mock.calls.find(([path, options]) => path === "/v1/achievements/ch-1" && options?.method === "PUT");
    expect(call?.[1]?.body).toEqual(expect.objectContaining({ saveMode: "new_challenge" }));
    expect(adminChallengeUpdateRequestSchema.safeParse(call?.[1]?.body).success).toBe(true);
  });

  it("offers the save-mode choice for text-only changes", async () => {
    const wrapper = await mountPage("titles");
    await expand(wrapper, "守望先锋");
    await wrapper.get('button[aria-label="编辑守望先锋的挑战"]').trigger("click");
    await flushPromises();
    const form = wrapper.get("form#admin-challenge-form");
    await form.findAll("textarea")[0]!.setValue("完成条件（修订措辞）");
    await flushPromises();
    expect(wrapper.text()).toContain("这次修改怎么保存");
    await form.findAll('button[role="radio"]')[1]!.trigger("click");
    await form.trigger("submit");
    await flushPromises();
    const call = adminApi.mock.calls.find(([path, options]) => path === "/v1/achievements/ch-1" && options?.method === "PUT");
    expect(call?.[1]?.body).toEqual(expect.objectContaining({ saveMode: "new_challenge", condition: "完成条件（修订措辞）" }));
  });

  it("sends in_place for window-only changes without prompting", async () => {
    const wrapper = await mountPage("titles");
    await expand(wrapper, "守望先锋");
    await wrapper.get('button[aria-label="编辑守望先锋的挑战"]').trigger("click");
    await flushPromises();
    const form = wrapper.get("form#admin-challenge-form");
    await form.findAll("input").find((input) => input.attributes("placeholder") === "例如 26.1003.1")!.setValue("26.1101.1");
    await flushPromises();
    expect(wrapper.text()).not.toContain("这次修改怎么保存");
    await form.trigger("submit");
    await flushPromises();
    const call = adminApi.mock.calls.find(([path, options]) => path === "/v1/achievements/ch-1" && options?.method === "PUT");
    expect(call?.[1]?.body).toEqual(expect.objectContaining({ saveMode: "in_place" }));
    expect(adminChallengeUpdateRequestSchema.safeParse(call?.[1]?.body).success).toBe(true);
  });

  it("keeps the announced sunset version when editing a sunsetting challenge", async () => {
    challengeLists.FLAWLESS = [sunsettingChallenge];
    const wrapper = await mountPage("titles");
    await expand(wrapper, "守望先锋");
    await wrapper.get('button[aria-label="编辑守望先锋的挑战"]').trigger("click");
    await flushPromises();
    const form = wrapper.get("form#admin-challenge-form");
    await form.findAll("textarea")[0]!.setValue("完成条件（措辞修订）");
    await flushPromises();
    await form.trigger("submit");
    await flushPromises();
    const call = adminApi.mock.calls.find(([path, options]) => path === "/v1/achievements/ch-sun" && options?.method === "PUT");
    expect(call?.[1]?.body).toEqual(expect.objectContaining({ saveMode: "in_place", retiredVersion: "26.1101.1" }));
  });

  it("creates a draft title and reports TITLE_KEY_CONFLICT on the key field", async () => {
    const wrapper = await mountPage("titles");
    await wrapper.findAll("button").find((button) => button.text() === "新建称号")!.trigger("click");
    await flushPromises();
    const form = wrapper.get("form#admin-title-form");
    await form.findAll("input")[0]!.setValue("新称号");
    await form.findAll("input").find((input) => input.attributes("placeholder") === "选择或输入")!.setValue("战绩");
    await form.findAll("input").find((input) => input.attributes("placeholder") === "例如 LIGHT_LOADOUT")!.setValue("FLAWLESS");
    adminApi.mockImplementationOnce((path: string, options?: { method?: string }) => {
      if (path === "/v1/titles" && options?.method === "POST") {
        const failure = new Error("conflict") as Error & { data?: unknown; statusCode?: number };
        failure.statusCode = 409;
        failure.data = { error: { code: "TITLE_KEY_CONFLICT", message: "唯一 key 已被其他称号使用", requestId: "req-1" } };
        return Promise.reject(failure);
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });

    await wrapper.findAll("button").find((button) => button.text() === "仅创建称号")!.trigger("click");
    await flushPromises();
    await flushPromises();
    expect(wrapper.text()).toContain("无法创建称号");
    expect(wrapper.text()).toContain("已被「守望先锋」使用");
  });

  it("keeps the map challenges page working through the unified workspace", async () => {
    const wrapper = await mountPage("map");
    await wrapper.get('button[aria-label="按地图查看"]').trigger("click");
    await flushPromises();
    const mapRow = wrapper.findAll("tr").find((row) => row.text().includes("国王大道挑战") && row.findAll("button").some((button) => button.text() === "编辑挑战"))!;
    await mapRow.findAll("button").find((button) => button.text() === "编辑挑战")!.trigger("click");
    const form = wrapper.get("form#achievement-editor");
    await form.find('input[maxlength="256"]').setValue("新的地图挑战");
    await form.findAll("textarea")[0]!.setValue("完成更新后的地图挑战");
    await form.trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/achievements/map-1", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ family: "map", name: "新的地图挑战", condition: "完成更新后的地图挑战", evidenceRule: "完整截图", submissionMode: "manual" }) }));
  });

  it("saves map rules and exceptions from the unified workspace", async () => {
    const wrapper = await mountPage("map");
    const ruleButton = wrapper.findAll("button").find((button) => button.text() === "编辑规则");
    expect(ruleButton).toBeTruthy();
    await ruleButton!.trigger("click");
    await wrapper.get("form#map-title-rule-editor").trigger("submit");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/map-title-rules/rule.conqueror", expect.objectContaining({ method: "PUT", body: expect.objectContaining({ titleKey: "CONQUEROR", kind: "conqueror", defaultScope: "all_active" }) }));
  });
});
