import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { qqChangelogPushItemSchema, qqChangelogPushRequestSchema, qqbotChangelogSendRequestSchema } from "@owbastion/contracts";

const spec = JSON.parse(readFileSync(new URL("../../../docs/api/openapi.json", import.meta.url), "utf8"));

const refs = (node: unknown, found: string[] = []): string[] => {
  if (Array.isArray(node)) node.forEach((item) => refs(item, found));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") found.push(value);
      else refs(value, found);
    }
  }
  return found;
};
const resolve = (ref: string) => ref.replace(/^#\//, "").split("/").reduce<any>((node, key) => node?.[key], spec);

describe("OpenAPI document", () => {
  it("resolves every $ref of the changelog push contract", () => {
    const { schemas } = spec.components;
    const contract = [spec.paths["/v1/admin/qq/changelog-pushes"], schemas.QqChangelogPushRequest, schemas.QqChangelogPushItem, schemas.QqbotChangelogSendRequest, schemas.QqbotChangelogSendResponse];
    expect(contract).not.toContain(undefined);
    expect([...new Set(refs(contract))].filter((ref) => resolve(ref) === undefined)).toEqual([]);
  });

  it.each([
    ["QqChangelogPushRequest", qqChangelogPushRequestSchema],
    ["QqChangelogPushItem", qqChangelogPushItemSchema],
    ["QqbotChangelogSendRequest", qqbotChangelogSendRequestSchema],
  ])("lists the same properties as the %s contract", (name, schema) => {
    expect(Object.keys(spec.components.schemas[name].properties).sort()).toEqual(Object.keys(schema.shape).sort());
  });
});
