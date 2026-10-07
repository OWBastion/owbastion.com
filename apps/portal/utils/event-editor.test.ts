import { describe, expect, it } from "vitest";
import { bodyFromForm, emptyEventForm } from "./event-editor";

describe("event create body", () => {
  it("trims the group and tags and sends an empty group as an empty string", () => {
    const form = { ...emptyEventForm(), name: "梭哈", category: "机制", description: "说明", gameVersion: "5.0", eventGroup: "  赌徒 ", effectTags: [" 心之钢 ", ""], weight: 0.7 };
    expect(bodyFromForm(form)).toMatchObject({ eventGroup: "赌徒", effectTags: ["心之钢"], weight: 0.7, challengeLinks: [] });
    expect(bodyFromForm({ ...form, eventGroup: "" }).eventGroup).toBe("");
  });
});
