import { describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";

const createDatabase = () => {
  const statement = {
    bind: vi.fn(),
    raw: vi.fn(async () => []),
  };
  statement.bind.mockReturnValue(statement);
  const prepare = vi.fn(() => statement);
  return { database: { prepare } as unknown as D1Database, prepare, statement };
};

describe("catalog services", () => {
  it("reads maps, challenges, and titles directly from D1 without a KV dependency", async () => {
    const { database, prepare, statement } = createDatabase();
    const services = createPlatformServices(database);

    await expect(services.listMaps()).resolves.toEqual([]);
    await expect(services.listChallenges({})).resolves.toEqual([]);
    await expect(services.listTitles({})).resolves.toEqual([]);

    expect(prepare).toHaveBeenCalled();
    expect(statement.raw).toHaveBeenCalled();
  });
});
