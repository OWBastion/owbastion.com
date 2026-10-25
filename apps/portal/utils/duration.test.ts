import { describe, expect, it } from "vitest";
import { formatDuration, parseDurationSeconds } from "./duration";

describe("duration", () => {
  it.each([
    ["1小时2分3秒", 3723], ["12分5秒", 725], ["45秒", 45], ["2分", 120], ["1:02:03", 3723], ["12:05", 725], ["725", 725],
  ])("reads %s", (input, seconds) => expect(parseDurationSeconds(input)).toBe(seconds));
  it.each(["", "abc", "1小时x分", "1:2"])("rejects %s", (input) => expect(parseDurationSeconds(input)).toBeNull());
  it("formats the screenshot style and round-trips", () => {
    expect(formatDuration(3723)).toBe("1小时2分3秒");
    expect(formatDuration(725)).toBe("12分5秒");
    expect(formatDuration(45)).toBe("45秒");
    expect(parseDurationSeconds(formatDuration(3600))).toBe(3600);
  });
});
