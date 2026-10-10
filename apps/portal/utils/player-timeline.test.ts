import { describe, expect, it } from "vitest";
import type { AdminPlayerDetail } from "../composables/useAdminApi";
import { buildPlayerTimeline, describeSubmission } from "./player-timeline";

const base = { submissionId: "s", status: "completed", mapName: "成就挑战", createdAt: 1, updatedAt: 1 };

describe("player timeline", () => {
  it("describes each challenge kind with concrete map and difficulty", () => {
    const map = { family: "map" as const, name: "釜山 地狱", mapName: "釜山", difficulty: "地狱" };
    expect(describeSubmission({ ...base, challenge: { ...map, kind: "difficulty_completion" } }).title).toBe("釜山 · 地狱 通关");
    expect(describeSubmission({ ...base, challenge: { ...map, kind: "difficulty_completion", mapVariant: "classic" } }).title).toBe("经典版 · 釜山 · 地狱 通关");
    expect(describeSubmission({ ...base, challenge: { ...map, kind: "pioneer" } }).title).toBe("开拓者 · 釜山");
    expect(describeSubmission({ ...base, challenge: { ...map, name: "征服者", kind: "map_title_achievement" } })).toEqual({ title: "称号：征服者", detail: "釜山" });
    expect(describeSubmission({ ...base, challenge: { family: "achievement", titleName: "钢门", category: "传奇系列", condition: "完成挑战", evidenceRule: "x" } }).title).toBe("成就：钢门");
  });

  it("merges submissions, completions and runs newest first and shows rejection reasons", () => {
    const player = {
      recentSubmissions: [{ ...base, status: "rejected", reason: "截图不完整", updatedAt: 30, challenge: { family: "map", name: "n", mapName: "釜山", difficulty: "简单", kind: "difficulty_completion" } }],
      recentCompletions: [{ completionId: "c", titleName: "征服者", mapName: "釜山", gameVersion: "2026.08", status: "active", completedAt: 20 }],
      progression: { recentVerifiedRuns: [{ runId: "r", mapName: "釜山", difficulty: "简单", gameVersion: "2026.08", awardedXp: 40, acceptedAt: 10 }] },
    } as unknown as AdminPlayerDetail;
    const timeline = buildPlayerTimeline(player);
    expect(timeline.map((entry) => entry.kind)).toEqual(["submission", "completion", "run"]);
    expect(timeline[0]).toMatchObject({ title: "釜山 · 简单 通关", status: { label: "未通过", tone: "error" } });
    expect(timeline[0]!.detail).toContain("原因：截图不完整");
  });
});
