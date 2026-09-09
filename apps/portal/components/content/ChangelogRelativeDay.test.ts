import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import ChangelogRelativeDay from "./ChangelogRelativeDay.vue";

const releasedAt = "2026-08-01T00:00:00.000Z";

describe("ChangelogRelativeDay", () => {
  it("renders past, today, and future labels from the viewer timezone after mount", async () => {
    const past = await mountSuspended(ChangelogRelativeDay, {
      props: {
        value: releasedAt,
        now: new Date("2026-08-04T09:00:00.000+08:00"),
        timeZone: "Asia/Shanghai",
      },
    });
    expect(past.text()).toContain("3 天前");

    const today = await mountSuspended(ChangelogRelativeDay, {
      props: {
        value: releasedAt,
        now: new Date("2026-08-01T23:30:00.000+08:00"),
        timeZone: "Asia/Shanghai",
      },
    });
    expect(today.text()).toContain("就在今天");

    const future = await mountSuspended(ChangelogRelativeDay, {
      props: {
        value: releasedAt,
        now: new Date("2026-07-30T18:00:00.000+08:00"),
        timeZone: "Asia/Shanghai",
      },
    });
    expect(future.text()).toContain("2 天后");
  });

  it("uses the viewer timezone at a UTC day boundary", async () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const newYork = await mountSuspended(ChangelogRelativeDay, {
      props: { value: releasedAt, now, timeZone: "America/New_York" },
    });
    expect(newYork.text()).toContain("1 天后");

    const shanghai = await mountSuspended(ChangelogRelativeDay, {
      props: { value: releasedAt, now, timeZone: "Asia/Shanghai" },
    });
    expect(shanghai.text()).toContain("就在今天");
  });
});
