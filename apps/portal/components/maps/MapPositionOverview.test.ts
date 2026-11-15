import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import type { MapPositionStage } from "@owbastion/contracts";
import MapPositionOverview from "./MapPositionOverview.vue";

const plotOf = async (stage: MapPositionStage) => {
  const wrapper = await mountSuspended(MapPositionOverview, { props: { stages: [stage] } });
  const bar = wrapper.find("svg[viewBox='0 0 800 520'] line");
  const hits = wrapper.findAll("[role='img'][tabindex='0'] circle");
  return {
    barLength: Number(bar.attributes("x2")) - Number(bar.attributes("x1")),
    points: hits.map((hit) => [Number(hit.attributes("cx")), Number(hit.attributes("cy"))]),
  };
};

describe("map position overview scale", () => {
  it("centres a single-point stage with a finite scale bar inside the plot", async () => {
    const { barLength, points } = await plotOf({ points: [{ kind: "bastion", position: [12.5, 3, -40] }] });
    expect(Number.isFinite(barLength)).toBe(true);
    expect(barLength).toBeGreaterThan(0);
    expect(barLength).toBeLessThanOrEqual(160);
    expect(points).toEqual([[400, 260]]);
  });

  it.each([0.5, 3, 12])("keeps the scale bar within its cap on a stage %s m across", async (span) => {
    const { barLength, points } = await plotOf({ points: [{ kind: "bastion", position: [0, 0, 0] }, { kind: "reset", position: [span, 0, 0] }] });
    expect(barLength).toBeGreaterThan(0);
    expect(barLength).toBeLessThanOrEqual(160);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(800);
      expect(y).toBe(260);
    }
  });
});
