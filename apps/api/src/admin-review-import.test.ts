import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp } from "./app";

const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const body = { contractVersion: "1", fileName: "survey.csv", csv: "ID,提交时间,提交人,评分事件,评分,评论" };
const makeApp = (services: Partial<PlatformServices>, authenticate = async () => maintainer as typeof maintainer | null) => createApp({ services: () => services as PlatformServices, authenticate });
const post = (app: ReturnType<typeof createApp>, path: string, payload: unknown, key?: string) => app.request(`http://localhost${path}`, {
  method: "POST",
  headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) },
  body: JSON.stringify(payload),
});
const paths = ["/v1/admin/reviews/imports/preview", "/v1/admin/reviews/imports"];

describe("admin review import HTTP contract", () => {
  it.each(paths)("protects %s with maintainer authorization", async (path) => {
    for (const [authenticate, status] of [[async () => null, 401], [async () => ({ ...maintainer, roles: [] }), 403]] as const) {
      expect((await post(makeApp({}, authenticate), path, body, "key")).status).toBe(status);
    }
  });

  it("rejects bodies that do not match the contract and imports without an idempotency key", async () => {
    expect((await post(makeApp({}), paths[0]!, { ...body, csv: "" })).status).toBe(422);
    expect((await post(makeApp({}), paths[1]!, body)).status).toBe(422);
    expect((await post(makeApp({}), paths[1]!, { ...body, extra: true }, "key")).status).toBe(422);
  });

  it("forwards the preview and import and maps service failures", async () => {
    const preview = { contractVersion: "1" as const, sourceHash: "hash", rowCount: 1, importCount: 1, errors: [], unresolved: [] };
    const imports: Array<{ key: string; fileName: string }> = [];
    const app = makeApp({
      previewAdminReviewImport: async () => preview,
      importAdminReviews: async (input, _auth, key) => { imports.push({ key, fileName: input.fileName }); return { contractVersion: "1", importedCount: 1 }; },
    });
    const previewResponse = await post(app, paths[0]!, body);
    expect(previewResponse.status).toBe(200);
    expect(await previewResponse.json()).toEqual(preview);
    const created = await post(app, paths[1]!, body, "import-1");
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ contractVersion: "1", importedCount: 1 });
    expect(imports).toEqual([{ key: "import-1", fileName: "survey.csv" }]);

    for (const [code, status] of [["REVIEW_IMPORT_INVALID", 422], ["REVIEW_IMPORT_DUPLICATE", 409], ["IDEMPOTENCY_CONFLICT", 409]] as const) {
      const failing = makeApp({ importAdminReviews: async () => { throw new Error(code); } });
      const response = await post(failing, paths[1]!, body, "key");
      expect(response.status).toBe(status);
      expect((await response.json() as { error: { code: string } }).error.code).toBe(code);
    }
  });
});
