import { describe, expect, it } from "vitest";
import { classifyCatalogImport, parseCatalogImportQueryOutput } from "./title-catalog.ts";

describe("catalog import identity", () => {
  const version = "26.0714.1";
  const hash = "a".repeat(64);
  const output = (records: unknown) => JSON.stringify([{ results: records }]);

  it("imports when no record exists", () => {
    expect(classifyCatalogImport(parseCatalogImportQueryOutput(output([])), version, hash)).toBe("import");
  });

  it("skips only when version and hash both match", () => {
    expect(classifyCatalogImport(parseCatalogImportQueryOutput(output([{ source_version: version, snapshot_hash: hash }])), version, hash)).toBe("skip");
  });

  it.each([
    [[{ source_version: version, snapshot_hash: "b".repeat(64) }]],
    [[{ source_version: "26.0715.1", snapshot_hash: hash }]],
    [[{ source_version: version, snapshot_hash: hash }, { source_version: "26.0715.1", snapshot_hash: "b".repeat(64) }]],
  ])("rejects conflicting records: %j", (records) => {
    expect(() => classifyCatalogImport(parseCatalogImportQueryOutput(output(records)), version, hash)).toThrow("CATALOG_IMPORT_CONFLICT");
  });

  it.each(["not json", JSON.stringify([{ results: [{ source_version: version }] }])])("rejects invalid query output", (value) => {
    expect(() => parseCatalogImportQueryOutput(value)).toThrow("CATALOG_IMPORT_QUERY_INVALID");
  });
});
