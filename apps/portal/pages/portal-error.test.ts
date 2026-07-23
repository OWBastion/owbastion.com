import { describe, expect, it } from "vitest";
import { normalizeRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";

describe("portal error presentation", () => {
  it("prefers the request id in the API error envelope", () => {
    const details = portalErrorDetails({ data: { error: { code: "FAILED", message: "保存失败", requestId: "api-123" } }, response: { status: 500, headers: new Headers({ "x-request-id": "header-123" }) } });
    expect(details).toMatchObject({ code: "FAILED", requestId: "api-123", description: "保存失败 请求编号：api-123", isServerError: true });
  });

  it("falls back to the response header", () => {
    expect(portalErrorDetails({ data: { error: { message: "上游失败" } }, response: { status: 502, headers: new Headers({ "x-request-id": "header-123" }) } }).requestId).toBe("header-123");
  });

  it("does not invent a request id for local errors", () => {
    expect(portalErrorDetails(new Error("浏览器权限不足"), "无法复制口令。")).toMatchObject({ message: "浏览器权限不足", requestId: undefined, description: "浏览器权限不足", isServerError: false });
  });

  it("rejects unsafe request ids", () => {
    expect(normalizeRequestId("request with spaces")).toBeUndefined();
    expect(normalizeRequestId("a".repeat(129))).toBeUndefined();
    expect(normalizeRequestId("portal:123")).toBe("portal:123");
    expect(portalErrorDetails({ data: { error: { message: "失败", requestId: "request with spaces" } }, response: { status: 500 } }).requestId).toBeUndefined();
  });
});
