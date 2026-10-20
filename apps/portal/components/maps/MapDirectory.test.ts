import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { Map } from "~/types/challenge";
import MapDirectory from "./MapDirectory.vue";

mockNuxtImport("useReviewSummaries", () => () => ({ refresh: async () => {}, summaryFor: () => null, loading: { value: false } }));

const map = (mapId: string, mapName: string, difficultyRating: Map["difficultyRating"], mechanics: string[] = []): Map =>
  ({ mapId, mapName, difficultyRating, mechanics, gameVersion: "1", coverUrl: null, backgroundUrl: null, defaultGameplayRevisionId: null });

const maps = [
  map("map.a", "阿尔卑斯", "T2"),
  map("map.b", "巴黎", "T0"),
  map("map.c", "沧海", null),
  map("map.d", "多拉多", "T2", ["三合一"]),
  map("map.e", "尼泊尔", "T5"),
];

const stubs = {
  UInput: { props: ["modelValue"], emits: ["update:modelValue"], template: "<input :value='modelValue' @input='$emit(\"update:modelValue\", $event.target.value)' />" },
  UEmpty: { props: ["title"], template: "<p class='empty'>{{ title }}</p>" },
  MapDetailModal: { template: "<div />" },
};

const mount = () => mountSuspended(MapDirectory, { props: { maps, challenges: [], authenticated: false }, global: { stubs } });
const headings = (wrapper: Awaited<ReturnType<typeof mount>>) => wrapper.findAll(".group-heading h2").map((heading) => heading.text());
const cards = (wrapper: Awaited<ReturnType<typeof mount>>) => wrapper.findAll(".map-card-name").map((name) => name.text());

describe("MapDirectory", () => {
  it("groups maps by rating from the largest mastery-XP bonus down, with unrated maps last", async () => {
    const wrapper = await mount();
    // Verified-run XP rule v3: T0 +20%, T2 +12%, T5 adds nothing.
    expect(headings(wrapper)).toEqual(["T0精通经验 +20%", "T2精通经验 +12%", "T5", "未评级"]);
    expect(cards(wrapper)).toEqual(["巴黎", "阿尔卑斯", "多拉多", "尼泊尔", "沧海"]);
  });

  it("narrows to one rating and by search text over names and mechanics", async () => {
    const wrapper = await mount();
    const filter = (label: string) => wrapper.findAll(".seg button").find((button) => button.text() === label)!;
    expect(wrapper.findAll(".seg button").map((button) => button.text())).toEqual(["全部", "T0", "T2", "T5", "未评级"]);

    await filter("T2").trigger("click");
    expect(cards(wrapper)).toEqual(["阿尔卑斯", "多拉多"]);
    expect(filter("T2").attributes("aria-pressed")).toBe("true");

    await wrapper.find("input").setValue("三合一");
    await flushPromises();
    expect(cards(wrapper)).toEqual(["多拉多"]);

    await filter("T0").trigger("click");
    expect(cards(wrapper)).toEqual([]);
    expect(wrapper.find(".empty").text()).toBe("没有找到");
  });
});
