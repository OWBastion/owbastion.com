import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;

describe("public event list status", () => {
  it("passes the development and all filters to the service and rejects unknown values", async () => {
    const inputs: unknown[] = [];
    const app = createApp({
      authenticate: async () => null,
      services: () => ({ listRandomEvents: async (input: unknown) => { inputs.push(input); return []; } }) as unknown as PlatformServices,
    });
    for (const status of ["development", "all", "bogus"]) {
      const response = await app.request(`http://localhost/v1/events?status=${status}`, {}, env);
      expect(response.status).toBe(status === "bogus" ? 422 : 200);
    }
    expect(inputs).toMatchObject([{ status: "development" }, { includeArchived: false }]);
    expect(inputs[1]).not.toHaveProperty("status");
  });
});
