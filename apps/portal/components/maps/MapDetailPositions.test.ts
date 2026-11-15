import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import MapDetailPositions from "./MapDetailPositions.vue";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.stubGlobal("$fetch", api);

const stage = (offset: number) => ({
  points: [
    { kind: "bastion", position: [offset, 1, 0] },
    { kind: "bastion", position: [offset + 10, 4.5, 10] },
    { kind: "reset", position: [offset, 0, 20] },
    { kind: "portal", position: [offset + 5, 0, 5] },
    { kind: "portal", position: [offset + 8, 0, 8] },
  ],
});

describe("map position overview", () => {
  it("reads the map's public positions and names every point with its coordinates", async () => {
    api.mockResolvedValue({ contractVersion: "1", item: { mapId: "map.hanamura", gameplayRevisionId: "revision:map.hanamura:initial", stages: [stage(0), stage(100)] } });
    const wrapper = await mountSuspended(MapDetailPositions, { props: { mapId: "map.hanamura" } });
    await flushPromises();

    expect(api).toHaveBeenCalledWith("/api/portal/v1/maps/map.hanamura/positions", expect.anything());
    const points = wrapper.findAll("[role='img'][tabindex='0']");
    expect(points.map((point) => point.attributes("aria-label"))).toEqual(expect.arrayContaining([
      "Bastion 出生点 1 · X 0 Y 1 Z 0",
      "Bastion 出生点 2 · X 10 Y 4.5 Z 10",
      "重置点 · X 0 Y 0 Z 20",
      "传送点 1 · X 5 Y 0 Z 5",
    ]));
    const readout = wrapper.find("[aria-live='polite']");
    expect(readout.text()).toBe("2 个出生点 · 高差 3.5 m");

    const reset = points.find((point) => point.attributes("aria-label")?.startsWith("重置点"))!;
    await reset.trigger("focus");
    expect(readout.text()).toBe("重置点 · X 0 Y 0 Z 20");
    await reset.trigger("blur");
    expect(readout.text()).toBe("2 个出生点 · 高差 3.5 m");

    await wrapper.find("[role='tablist']").findAll("[role='tab']")[1]!.trigger("mousedown", { button: 0 });
    await flushPromises();
    expect(wrapper.findAll("[role='img'][tabindex='0']").map((point) => point.attributes("aria-label"))).toContain("重置点 · X 100 Y 0 Z 20");
  });

  it("leaves the section out when the map has no public positions", async () => {
    api.mockResolvedValue({ contractVersion: "1", item: { mapId: "map.empty", gameplayRevisionId: null, stages: [] } });
    const wrapper = await mountSuspended(MapDetailPositions, { props: { mapId: "map.empty" } });
    await flushPromises();
    expect(wrapper.find("section").exists()).toBe(false);
  });
});
