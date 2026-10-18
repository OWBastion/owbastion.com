import { describe, expect, it } from "vitest";
import { containedReservedPlayerHandleTerms, exactReservedPlayerHandleTerms, normalizePlayerHandle, validatePlayerHandle } from "./player-handle";

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

  it.each([...exactReservedPlayerHandleTerms, ...containedReservedPlayerHandleTerms])("rejects the reserved term %s exactly", (term) => {
    expect(validatePlayerHandle(term)).toEqual({ error: "HANDLE_RESERVED" });
    expect(validatePlayerHandle(term.toUpperCase())).toEqual({ error: "HANDLE_RESERVED" });
    expect(validatePlayerHandle(term.replace(/[a-z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)))).toEqual({ error: "HANDLE_RESERVED" });
  });

  it("accepts exact-only terms inside longer IDs", () => {
    for (const handle of ["james", "homer", "apiary", "rapid", "堡垒王", "ow堡垒", "users1"]) {
      expect(validatePlayerHandle(handle)).toEqual({ handle });
    }
  });

  it("rejects containment terms inside longer IDs", () => {
    for (const handle of ["myadmin1", "我是客服号", "ＡＤＭＩＮ", "xbastion"]) {
      expect(validatePlayerHandle(handle)).toEqual({ error: "HANDLE_RESERVED" });
    }
  });
});
