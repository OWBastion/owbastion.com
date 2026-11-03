import { describe, expect, it } from "vitest";
import { annotateEventSections, resolveEventHeading, type AstNode } from "../../content/event-history";
import { eventLineage } from "../../content/event-lineage";
import { findEventHistory } from "../../utils/editorial-content";

const ironBulwark = eventLineage.find((entry) => entry.names.includes("任务：钢铁防线"))!;
const el = (tag: string, text: string): AstNode => ({ type: "element", tag, props: {}, children: [{ type: "text", value: text }] });

describe("event lineage", () => {
  it("links a renamed heading to the same event", () => {
    expect(resolveEventHeading("钢铁防线", "26.0123.1").entries).toEqual([ironBulwark]);
    expect(resolveEventHeading("任务：钢铁防线（重做）", "26.1101.1")).toEqual({ entries: [ironBulwark], tag: "重做" });
  });

  it("resolves a reused name by release version", () => {
    const old = resolveEventHeading("吸血鬼", "26.0123.1").entries[0]!;
    const current = resolveEventHeading("吸血鬼", "26.0912.1").entries[0]!;
    expect(old.names).toContain("献祭");
    expect(current).not.toBe(old);
  });

  it("resolves both sides of a combined heading", () => {
    expect(resolveEventHeading("赌徒：乐于助人 → 赌徒：孤注一掷", "26.1019.1").entries).toHaveLength(1);
    expect(resolveEventHeading("操盘手/操盘手 ProMax", "26.0227.1").entries).toHaveLength(2);
  });

  it("rejects a heading no event owns", () => {
    expect(() => resolveEventHeading("不存在的事件", "26.1101.1")).toThrow(/不存在的事件/);
  });
});

describe("event history extraction", () => {
  const release = { version: "26.1101.1", releasedAt: "2026-11-01T00:00:00.000Z", path: "/changelog/26.1101.1" };

  it("collects balance sections and skips fixes", () => {
    const list = el("ul", "抵挡伤害");
    const { sections, children } = annotateEventSections(release, [
      el("h2", "🔃 随机事件调整"),
      el("h3", "增益类事件"),
      el("h4", "任务：钢铁防线（重做）"),
      list,
      el("h2", "🐛 错误修复"),
      el("h3", "随机事件"),
      el("h4", "任务：钢铁防线"),
      el("ul", "不应出现"),
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.entry.body).toEqual([list]);
    expect(sections[0]!.entry.tag).toBe("重做");
    expect(children[2]!.children![0]!.tag).toBe("event-name-hover");
    expect(children[6]!.children![0]!.tag).toBeUndefined();
  });
});

describe("generated event history", () => {
  it("lists every release that changed an event, newest first", async () => {
    const history = await findEventHistory(ironBulwark.eventId!);
    expect(history.map((item) => item.version)).toEqual(["26.1101.1", "26.0912.1", "26.0729.1", "26.0131.1", "26.0123.1"]);
  });

  it("is empty for an unknown event", async () => {
    expect(await findEventHistory("event.unknown")).toEqual([]);
  });
});
