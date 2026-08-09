import { describe, expect, it, vi } from "vitest";
import { deployOperations, listOperations, operationsFromOpenApi } from "./deploy-api-endpoints.ts";

describe("API endpoint deployment", () => {
  it("extracts sorted Cloudflare operations from OpenAPI paths", () => {
    expect(operationsFromOpenApi({ servers: [{ url: "https://api.example.com" }], paths: { "/v1/z": { post: {}, parameters: [] }, "/health": { get: {} } } })).toEqual([
      { endpoint: "/health", host: "api.example.com", method: "GET" },
      { endpoint: "/v1/z", host: "api.example.com", method: "POST" },
    ]);
  });

  it("reads all operation inventory pages", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ endpoint: "/health", host: "api.example.com", method: "GET" }], result_info: { page: 1, total_pages: 2 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ endpoint: "/v1/{var1}", host: "api.example.com", method: "GET" }], result_info: { page: 2, total_pages: 2 } }), { status: 200 }));

    await expect(listOperations("zone-id", "token", fetcher)).resolves.toHaveLength(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, "https://api.cloudflare.com/client/v4/zones/zone-id/api_gateway/operations?page=1&per_page=50", expect.objectContaining({ method: "GET" }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "https://api.cloudflare.com/client/v4/zones/zone-id/api_gateway/operations?page=2&per_page=50", expect.objectContaining({ method: "GET" }));
  });

  it("posts only operations missing from the existing inventory", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [{ endpoint: "/v1/{var1}", host: "api.example.com", method: "GET" }], result_info: { page: 1, total_pages: 1 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [] }), { status: 200 }));

    await deployOperations("zone-id", "token", [
      { endpoint: "/v1/{playerId}", host: "api.example.com", method: "GET" },
      { endpoint: "/health", host: "api.example.com", method: "GET" },
    ], fetcher);
    expect(fetcher).toHaveBeenNthCalledWith(2, "https://api.cloudflare.com/client/v4/zones/zone-id/api_gateway/operations", expect.objectContaining({ method: "POST", body: JSON.stringify([{ endpoint: "/health", host: "api.example.com", method: "GET" }]) }));
  });

  it("does not post when every operation is already present", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: [{ endpoint: "/health", host: "api.example.com", method: "GET" }], result_info: { page: 1, total_pages: 1 } }), { status: 200 }));

    await expect(deployOperations("zone-id", "token", [{ endpoint: "/health", host: "api.example.com", method: "GET" }], fetcher)).resolves.toMatchObject({ created: 0, skipped: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails when Cloudflare rejects the inventory read", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ message: "invalid token" }] }), { status: 403 }));
    await expect(deployOperations("zone-id", "token", [{ endpoint: "/health", host: "api.example.com", method: "GET" }], fetcher)).rejects.toThrow("invalid token");
  });

  it("fails when Cloudflare rejects the operation deployment", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, errors: [{ message: "operation limit" }] }), { status: 403 }));
    await expect(deployOperations("zone-id", "token", [{ endpoint: "/health", host: "api.example.com", method: "GET" }], fetcher)).rejects.toThrow("operation limit");
  });
});
