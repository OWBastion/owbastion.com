import { describe, expect, it } from "vitest";
import { matchGameMode } from "./gameplay-revision";

describe("game mode label tolerance", () => {
  const known = ["2026镜中回响"];

  it.each([
    ["2026镜申回响", "2026镜中回响"],
    ["202S镜中回响", "2026镜中回响"],
    ["202§镜中回响", "2026镜中回响"],
    ["2026镜：回响", "2026镜中回响"],
    ["20类镜中回响", "2026镜中回响"],
    ["随机票件5.0", "随机事件5.0"],
    ["随机事5.0", "随机事件5.0"],
    ["辆机事件5.0", "随机事件5.0"],
  ])("reads %s as %s", (read, mode) => {
    expect(matchGameMode(read, known)).toEqual({ mode, approximate: true });
  });

  it("leaves exact labels, spaced labels and the regular label alone", () => {
    expect(matchGameMode("2026镜中回响", known)).toEqual({ mode: "2026镜中回响", approximate: false });
    expect(matchGameMode("2026 镜中回响", known)).toEqual({ mode: "2026镜中回响", approximate: false });
    expect(matchGameMode("随机事件5.0", known)).toEqual({ mode: "随机事件5.0", approximate: false });
    expect(matchGameMode(null, known)).toEqual({ mode: null, approximate: false });
  });

  it("does not turn a different year, a bare year or a distant label into a known mode", () => {
    expect(matchGameMode("2027镜中回响", known)).toEqual({ mode: "2027镜中回响", approximate: false });
    expect(matchGameMode("2026", known)).toEqual({ mode: "2026", approximate: false });
    expect(matchGameMode("机事伴5.0", known)).toEqual({ mode: "机事伴5.0", approximate: false });
    expect(matchGameMode("挑战模式", known)).toEqual({ mode: "挑战模式", approximate: false });
  });

  it("refuses a label that is equally close to two modes", () => {
    expect(matchGameMode("2026镜中回响A", ["2026镜中回响B", "2026镜中回响C"])).toEqual({ mode: "2026镜中回响A", approximate: false });
  });
});
