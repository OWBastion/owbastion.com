import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { readTitleCatalogSnapshot, renderCatalogSchemaMigration } from "./title-catalog.ts";

async function main() {
  const input = process.argv[2] ?? "snapshots/2026.07.15/title-catalog.json";
  const output = process.argv[3] ?? "migrations/0010_title_catalog.sql";
  const snapshot = readTitleCatalogSnapshot(JSON.parse(await fs.readFile(path.resolve(input), "utf8")));
  const sql = (value: string | null) => value == null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
  const id = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);
  const lines = renderCatalogSchemaMigration();
  for (const title of snapshot.titles) lines.push(`INSERT INTO title_catalog (key, label, category, condition, availability, scope, display_kind, game_version) VALUES (${sql(title.key)}, ${sql(title.label)}, ${sql(title.category)}, ${sql(title.condition)}, ${sql(title.availability)}, ${sql(title.scope)}, ${sql(title.displayKind)}, ${sql(snapshot.gameVersion)});`);
  for (const map of snapshot.maps) lines.push(`INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES (${sql(map.mapId)}, ${sql(map.mapName)}, ${sql(map.gameVersion)}, ${sql(map.status)}, ${sql(snapshot.gameVersion)}, 1752537600000, 1752537600000) ON CONFLICT(id) DO UPDATE SET name = excluded.name, game_version = excluded.game_version, status = excluded.status, updated_at = excluded.updated_at;`);
  for (const map of snapshot.maps) for (const reward of map.rewards) {
    lines.push(`INSERT INTO map_title_rewards (map_id, slot, title_key, pioneer_prefixes_json) VALUES (${sql(map.mapId)}, ${sql(reward.slot)}, ${sql(reward.titleKey)}, ${sql(JSON.stringify(reward.slot === "pioneer" ? map.pioneerPrefixes : []))});`);
    for (const holderName of reward.holderNames) lines.push(`INSERT INTO historical_title_grants (id, scope, map_id, slot, title_key, holder_name, source_version) VALUES (${sql(id(`map:${map.mapId}:${reward.slot}:${reward.titleKey}:${holderName}`))}, 'map', ${sql(map.mapId)}, ${sql(reward.slot)}, ${sql(reward.titleKey)}, ${sql(holderName)}, ${sql(snapshot.sourceVersion)});`);
  }
  for (const grant of snapshot.globalGrants) lines.push(`INSERT INTO historical_title_grants (id, scope, map_id, slot, title_key, holder_name, source_version) VALUES (${sql(id(`global:${grant.titleKey}:${grant.holderName}`))}, 'global', NULL, NULL, ${sql(grant.titleKey)}, ${sql(grant.holderName)}, ${sql(snapshot.sourceVersion)});`);
  await fs.writeFile(path.resolve(output), `${lines.join("\n")}\n`);
  console.log(`Generated ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
