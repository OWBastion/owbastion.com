import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import EventVersionDirectory from "./EventVersionDirectory.vue";

const global = { stubs: { EventDirectory: { props: ["events"], template: "<div>事件 {{ events.length }}</div>" }, UAlert: { template: "<div>读取失败</div>" } } };

describe("EventVersionDirectory", () => {
  it("opens the latest version and requests older versions only after expansion", async () => {
    const wrapper = await mountSuspended(EventVersionDirectory, { props: { versions: [{ gameVersion: "26.0722.1", eventCount: 2 }, { gameVersion: "26.0715.1", eventCount: 1 }], eventsByVersion: { "26.0722.1": [] } }, global });
    expect(wrapper.text()).toContain("事件 0");
    expect(wrapper.emitted("loadVersion")).toBeUndefined();
    await wrapper.findAll(".version-toggle")[1]!.trigger("click");
    expect(wrapper.emitted("loadVersion")).toEqual([["26.0715.1"]]);
  });
});
