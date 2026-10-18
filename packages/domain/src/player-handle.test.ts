import { describe, expect, it } from "vitest";
import { normalizePlayerHandle, reservedPlayerHandleTerms, validatePlayerHandle } from "./player-handle";

describe("player handle rules", () => {
  it("normalizes with NFKC and ASCII lowercase only", () => {
    expect(normalizePlayerHandle("  ＴｅａＫ１ ")).toBe("teak1");
    expect(normalizePlayerHandle("速通ＡＢ")).toBe("速通ab");
  });

  it("counts characters, not UTF-16 units, and accepts mixed ASCII and Chinese", () => {
    expect(validatePlayerHandle("速通")).toEqual({ handle: "速通" });
    expect(validatePlayerHandle("a".repeat(9))).toEqual({ handle: "a".repeat(9) });
    expect(validatePlayerHandle("a".repeat(10))).toEqual({ error: "HANDLE_INVALID_LENGTH" });
    expect(validatePlayerHandle("速".repeat(10))).toEqual({ error: "HANDLE_INVALID_LENGTH" });
    expect(validatePlayerHandle("x")).toEqual({ error: "HANDLE_INVALID_LENGTH" });
  });

  it("reports the first violated rule", () => {
    expect(validatePlayerHandle("a-b")).toEqual({ error: "HANDLE_INVALID_CHARACTERS" });
    expect(validatePlayerHandle("ab𠀀")).toEqual({ error: "HANDLE_INVALID_CHARACTERS" });
    expect(validatePlayerHandle("2026")).toEqual({ error: "HANDLE_ALL_DIGITS" });
    expect(validatePlayerHandle("1a")).toEqual({ handle: "1a" });
  });

  it.each(reservedPlayerHandleTerms)("rejects the reserved term %s", (term) => {
    expect(validatePlayerHandle(term)).toEqual({ error: "HANDLE_RESERVED" });
    expect(validatePlayerHandle(term.toUpperCase())).toEqual({ error: "HANDLE_RESERVED" });
  });

  it("matches reserved terms by containment, not only exactly", () => {
    expect(validatePlayerHandle("myadmin1")).toEqual({ error: "HANDLE_RESERVED" });
    expect(validatePlayerHandle("我是客服号")).toEqual({ error: "HANDLE_RESERVED" });
    expect(validatePlayerHandle("ＡＤＭＩＮ")).toEqual({ error: "HANDLE_RESERVED" });
  });
});
