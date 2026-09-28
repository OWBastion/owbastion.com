import { createTestD1 } from "../test/d1";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "@owbastion/domain";
import { createPlatformServices } from "./index";

const createD1 = () => createTestD1();
const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  CREATE TABLE title_catalog (
    key TEXT PRIMARY KEY NOT NULL,
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'award',
    icon_url TEXT,
    icon_object_key TEXT,
    category TEXT NOT NULL,
    condition TEXT NOT NULL,
    availability TEXT NOT NULL,
    lifecycle TEXT NOT NULL DEFAULT 'active',
    public_visibility INTEGER NOT NULL DEFAULT 1,
    scope TEXT NOT NULL,
    display_kind TEXT NOT NULL,
    color_json TEXT NOT NULL DEFAULT 'null',
    game_version TEXT NOT NULL
  );
  CREATE TABLE audit_events (
    id TEXT PRIMARY KEY NOT NULL,
    correlation_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const insertTitle = (sqlite: DatabaseSync, key: string) => sqlite.prepare(
  "INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES (?, '标题', 'award', '测试', '条件', 'active', 'global', 'fixed', 'null', '2026.07.15')",
).run(key);

const createFakeEvidenceBucket = () => {
  const objects = new Map<string, { body: ArrayBuffer; contentType: string }>();
  const bucket = {
    async put(key: string, body: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { body, contentType: options?.httpMetadata?.contentType ?? "application/octet-stream" });
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return { body: object.body, httpMetadata: { contentType: object.contentType }, httpEtag: `"${key}"` };
    },
    async delete(key: string) { objects.delete(key); },
  };
  return { bucket: bucket as unknown as R2Bucket, objects };
};

const auth: AuthContext = { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" };

describe("achievement icon versioning", () => {
  it("mints a different iconUrl for each upload and lets the old versioned URL 404 instead of serving the replacement's bytes", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    insertTitle(sqlite, "FLAWLESS");
    const { bucket } = createFakeEvidenceBucket();
    const services = createPlatformServices(database, bucket, "https://api.example.com");

    const first = await services.uploadAdminTitleIcon({ titleKey: "FLAWLESS", body: new TextEncoder().encode("icon-a").buffer, contentType: "image/png" }, auth);
    const second = await services.uploadAdminTitleIcon({ titleKey: "FLAWLESS", body: new TextEncoder().encode("icon-b").buffer, contentType: "image/png" }, auth);

    // Acceptance: two different uploads for the same title produce two different iconUrl values.
    expect(first.iconUrl).not.toBe(second.iconUrl);

    const firstVersion = new URL(first.iconUrl).pathname.split("/").pop()!;
    const secondVersion = new URL(second.iconUrl).pathname.split("/").pop()!;

    // The current (second) version resolves.
    await expect(services.getPublicTitleIcon({ titleKey: "FLAWLESS", version: secondVersion })).resolves.toMatchObject({ contentType: "image/png" });

    // Acceptance: the old (first) versioned URL never resolves to the new bytes — it 404s
    // instead, because the object it pointed at was replaced, not reused for different content.
    await expect(services.getPublicTitleIcon({ titleKey: "FLAWLESS", version: firstVersion })).resolves.toBeNull();
  });

  it("serves the unversioned/legacy request as the current icon regardless of version, for backward compatibility", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    insertTitle(sqlite, "FLAWLESS");
    const { bucket } = createFakeEvidenceBucket();
    const services = createPlatformServices(database, bucket, "https://api.example.com");

    await services.uploadAdminTitleIcon({ titleKey: "FLAWLESS", body: new TextEncoder().encode("icon-a").buffer, contentType: "image/png" }, auth);
    await services.uploadAdminTitleIcon({ titleKey: "FLAWLESS", body: new TextEncoder().encode("icon-b").buffer, contentType: "image/png" }, auth);

    const legacy = await services.getPublicTitleIcon({ titleKey: "FLAWLESS" });
    expect(legacy).not.toBeNull();

    const bytes = new Uint8Array(await new Response(legacy!.body).arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toBe("icon-b");
  });

  it("falsification: reverting to a stable, un-versioned iconUrl makes both uploads collide and would leak new bytes at the old URL", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    insertTitle(sqlite, "FLAWLESS");
    const { bucket } = createFakeEvidenceBucket();
    const services = createPlatformServices(database, bucket, "https://api.example.com");

    const first = await services.uploadAdminTitleIcon({ titleKey: "FLAWLESS", body: new TextEncoder().encode("icon-a").buffer, contentType: "image/png" }, auth);
    const second = await services.uploadAdminTitleIcon({ titleKey: "FLAWLESS", body: new TextEncoder().encode("icon-b").buffer, contentType: "image/png" }, auth);

    // Simulates the pre-fix stable URL: `.../achievement-icons/FLAWLESS` for both uploads.
    const stableUrl = "https://api.example.com/v1/public/achievement-icons/FLAWLESS";
    expect(first.iconUrl).not.toBe(stableUrl); // fails if the stable-URL behavior is restored
    expect(second.iconUrl).not.toBe(stableUrl);
  });
});
