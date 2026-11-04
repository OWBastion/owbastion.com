import { describe, expect, it } from "vitest";
import { annotateEventSections, dedupeEventHistory, resolveEventHeading, type AstNode, type EventHistoryEntry } from "../../content/event-history";
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

describe("event history scope and list items", () => {
  const release = { version: "26.1001.1", releasedAt: "2026-10-01T00:00:00.000Z", path: "/changelog/26.1001.1" };
  const li = (...children: AstNode[]): AstNode => ({ type: "element", tag: "li", props: {}, children });
  const strong = (text: string): AstNode => ({ type: "element", tag: "strong", props: {}, children: [{ type: "text", value: text }] });
  const text = (value: string): AstNode => ({ type: "text", value });
  const ul = (...items: AstNode[]): AstNode => ({ type: "element", tag: "ul", props: {}, children: items });
  const idOf = (name: string) => eventLineage.find((entry) => entry.names.includes(name))!.eventId!;

  it("labels a section with the mode named in the note under its heading", () => {
    const { sections } = annotateEventSections(release, [
      el("h2", "🔃 周年模式随机事件调整"),
      el("blockquote", "以下调整仅适用于「镜中回响」周年模式。"),
      el("h3", "增益类事件"),
      el("h4", "任务：钢铁防线"),
      el("ul", "权重调整"),
    ]);
    expect(sections[0]!.entry.scope).toBe("镜中回响");
  });

  it("labels events changed inside an activity section", () => {
    const { sections } = annotateEventSections({ ...release, version: "26.0212.1" }, [
      el("h2", "🏮 春节限时活动：鸿运当头"),
      el("blockquote", "以下调整仅适用于「鸿运当头」限时活动。"),
      el("h3", "鸿运当头模式调整"),
      ul(li(text("「命运共同体」从鸿运当头事件池中移除。"))),
      el("h3", "鸿运当头随机事件调整"),
      ul(li(text("「作弊：我要验牌」「赌徒：短期投资」从鸿运当头事件池中移除。"))),
    ]);
    expect(sections.map((item) => [item.eventId, item.entry.scope])).toEqual([[idOf("作弊：我要验牌"), "鸿运当头"], [idOf("赌徒：短期投资"), "鸿运当头"]]);
  });

  it("does not label a preview or a series as a limited-time activity", () => {
    const { sections } = annotateEventSections(release, [
      el("h2", "🔃 随机事件调整"),
      el("h3", "「我独系列」"),
      el("h4", "魔术大师"),
      el("blockquote", "5.0 事件抢鲜体验"),
      el("ul", "权重由 0.5 增加至 1.5"),
    ]);
    expect(sections[0]!.entry.scope).toBeUndefined();
    expect(sections[0]!.entry.body).toHaveLength(2);
  });

  it("reads bold-labelled and quoted list items as per-event changes", () => {
    const { sections } = annotateEventSections(release, [
      el("h2", "🔃 随机事件调整"),
      el("h3", "「我独系列」限时体验结束"),
      ul(li(text("「我独自升级」「我独自决定」从事件池中移除。"))),
      el("h3", "赌徒"),
      ul(li(strong("赌徒："), text(" 获胜时获得的心之钢由 8 层增加至 16 层。"))),
    ]);
    expect(sections.map((item) => item.eventId)).toEqual([idOf("我独自升级"), idOf("我独自决定"), idOf("赌徒")]);
    expect(sections[0]!.entry.scope).toBeUndefined();
  });

  it("shows the name an event had in that release", () => {
    const { sections } = annotateEventSections(release, [el("h2", "🔃 随机事件调整"), el("h4", "钢铁防线"), el("ul", "护甲")]);
    expect(sections[0]!.entry.formerName).toBe("钢铁防线");
  });

  it("drops a change that repeats the one before it", () => {
    const entry = (version: string, scope?: string): EventHistoryEntry => ({ version, releasedAt: "2026-01-01T00:00:00.000Z", path: `/changelog/${version}`, scope, body: [el("ul", "权重由 1.2 增加至 1.3")] });
    const kept = dedupeEventHistory([entry("26.0227.1"), entry("26.0131.1"), entry("26.0212.1"), entry("26.0317.1", "活动")]);
    expect(kept.map((item) => item.version)).toEqual(["26.0317.1", "26.0131.1"]);
  });

  it("merges the changes of one release into one entry", () => {
    const entry = (tag: string | undefined, text: string): EventHistoryEntry => ({ version: "26.1017.1", releasedAt: "2026-01-01T00:00:00.000Z", path: "/changelog/26.1017.1", tag, body: [el("ul", text)] });
    const kept = dedupeEventHistory([entry(undefined, "权重增加"), entry("新增", "加入事件池")]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.body).toHaveLength(2);
    expect(kept[0]!.tag).toBe("新增");
  });
});

describe("generated event history", () => {
  it("lists every release that changed an event, newest first", async () => {
    const history = await findEventHistory(ironBulwark.eventId!);
    expect(history.map((item) => item.version)).toEqual(["26.1101.1", "26.0912.1", "26.0729.1", "26.0131.1", "26.0123.1"]);
  });

  it("keeps the history of a removed event and splits a reused name by version", async () => {
    const [early, returned] = eventLineage.filter((entry) => entry.names.some((name) => typeof name !== "string" && name.name === "我独自闯关" || name === "我独自闯关"));
    expect((await findEventHistory(early!.eventId!)).map((item) => item.version)).toEqual(["26.0317.1", "25.1223.1"]);
    expect((await findEventHistory(returned!.eventId!)).map((item) => item.version)).toEqual(["26.1030.1", "26.1017.1"]);
  });

  it("is empty for an unknown event", async () => {
    expect(await findEventHistory("event.unknown")).toEqual([]);
  });
});
