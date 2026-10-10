import { describe, expect, it } from "vitest";
import type { AdminMapEditorChallengeOption } from "~/composables/useAdminMapEditor";
import { enabledCount, groupHonors, recommendedAssignments, setHonorEnabled } from "./map-honors";

const option = (overrides: Partial<AdminMapEditorChallengeOption>): AdminMapEditorChallengeOption => ({
  challengeFamily: "map_challenge", challengeId: "c", label: "挑战", kind: "difficulty_completion", titleKey: null, status: "active", gameVersion: "2026.07.15", ...overrides,
});
const catalog = [
  option({ challengeFamily: "map_challenge", challengeId: "map.conqueror", label: "征服者挑战", titleKey: "CONQUEROR" }),
  option({ challengeFamily: "map_title_rule", challengeId: "rule.conqueror", label: "征服者", kind: "conqueror", titleKey: "CONQUEROR" }),
  option({ challengeFamily: "map_title_rule", challengeId: "rule.classic", label: "老兵", kind: "classic", titleKey: "VETERAN" }),
  option({ challengeFamily: "map_challenge", challengeId: "map.solo", label: "独立挑战" }),
];

describe("map honors", () => {
  it("groups a title with the challenges that reward it, rule first", () => {
    const honors = groupHonors(catalog);
    expect(honors.map((honor) => [honor.name, honor.kind, honor.items.map((item) => item.challengeId)])).toEqual([
      ["征服者", "conqueror", ["rule.conqueror", "map.conqueror"]],
      ["老兵", "classic", ["rule.classic"]],
      ["独立挑战", "other", ["map.solo"]],
    ]);
  });

  it("enables and disables every item of an honor together", () => {
    const [conqueror] = groupHonors(catalog);
    const on = setHonorEnabled({}, conqueror!, true);
    expect(enabledCount(conqueror!, on)).toBe(2);
    const off = setHonorEnabled(on, conqueror!, false);
    expect(enabledCount(conqueror!, off)).toBe(0);
    expect(Object.keys(off)).toHaveLength(2);
  });

  it("recommends the veteran honor for classic revisions and everything else otherwise", () => {
    const honors = groupHonors(catalog);
    const classic = recommendedAssignments({}, honors, "classic");
    expect(Object.values(classic).filter((item) => item.enabled).map((item) => item.challengeId)).toEqual(["rule.classic"]);
    const standard = recommendedAssignments(classic, honors, null);
    expect(Object.values(standard).filter((item) => item.enabled).map((item) => item.challengeId).sort()).toEqual(["map.conqueror", "map.solo", "rule.conqueror"]);
  });
});
