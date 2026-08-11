import { getTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { gameplayRevisions } from "./schema";

describe("gameplay revision schema", () => {
  it("keeps copied_from_revision_id as a self foreign key", () => {
    const reference = getTableConfig(gameplayRevisions).foreignKeys
      .map((foreignKey) => foreignKey.reference())
      .find((foreignKey) => foreignKey.columns[0]?.name === "copied_from_revision_id");

    expect(reference?.foreignTable).toBe(gameplayRevisions);
    expect(reference?.foreignColumns[0]?.name).toBe("id");
  });
});
