import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

type Snapshot = {
  schemaVersion: number;
  sourceVersion: string;
  gameVersion: string;
  titles: Array<{ key: string; label: string; category: string; condition: string; availability: string; scope: string; displayKind: string }>;
  maps: Array<{ mapId: string; mapName: string; gameVersion: string; status: string; pioneerPrefixes: string[]; rewards: Array<{ slot: string; titleKey: string; holderNames: string[] }> }>;
  globalGrants: Array<{ holderName: string; titleKey: string; scope: "global" }>;
};

async function main() {
const input = process.argv[2] ?? "snapshots/2026.07.15/title-catalog.json";
const output = process.argv[3] ?? "migrations/0010_title_catalog.sql";
const snapshot = JSON.parse(await fs.readFile(path.resolve(input), "utf8")) as Snapshot;
const titleKeys = new Set(snapshot.titles.map((title) => title.key));
const mapSlots = new Set(["pioneer", "conqueror", "dominator"]);

if (snapshot.schemaVersion !== 1 || snapshot.titles.length !== 58 || snapshot.maps.length !== 38) throw new Error("Unexpected Bastion title catalog counts");
if (snapshot.titles.filter((title) => title.scope === "map").map((title) => title.key).sort().join(",") !== "CONQUEROR,DOMINATOR,PIONEER") throw new Error("Unexpected map title scope");
for (const map of snapshot.maps) {
  const conquerors = new Set(map.rewards.find((reward) => reward.slot === "conqueror")?.holderNames ?? []);
  for (const reward of map.rewards) {
    if (!mapSlots.has(reward.slot) || !titleKeys.has(reward.titleKey) || reward.titleKey !== reward.slot.toUpperCase()) throw new Error(`Invalid reward ${map.mapId}/${reward.slot}`);
    if (new Set(reward.holderNames).size !== reward.holderNames.length) throw new Error(`Duplicate holder in ${map.mapId}/${reward.slot}`);
    if (reward.slot === "dominator" && reward.holderNames.some((holder) => !conquerors.has(holder))) throw new Error(`Dominator holder is not conqueror in ${map.mapId}`);
  }
}

const sql = (value: string | null) => value == null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
const id = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);
const lines: string[] = [
  "CREATE TABLE title_catalog (",
  "  key TEXT PRIMARY KEY NOT NULL,",
  "  label TEXT NOT NULL,",
  "  category TEXT NOT NULL,",
  "  condition TEXT NOT NULL,",
  "  availability TEXT NOT NULL CHECK (availability IN ('active', 'retired')),",
  "  scope TEXT NOT NULL CHECK (scope IN ('global', 'map')),",
  "  display_kind TEXT NOT NULL CHECK (display_kind IN ('fixed', 'map_pioneer', 'map_name_suffix')),",
  "  game_version TEXT NOT NULL",
  ");",
  "",
  "CREATE TABLE map_title_rewards (",
  "  map_id TEXT NOT NULL REFERENCES maps(id),",
  "  slot TEXT NOT NULL CHECK (slot IN ('pioneer', 'conqueror', 'dominator')),",
  "  title_key TEXT NOT NULL REFERENCES title_catalog(key),",
  "  pioneer_prefixes_json TEXT NOT NULL,",
  "  PRIMARY KEY (map_id, slot),",
  "  UNIQUE (map_id, title_key)",
  ");",
  "",
  "CREATE TABLE historical_title_grants (",
  "  id TEXT PRIMARY KEY NOT NULL,",
  "  scope TEXT NOT NULL CHECK (scope IN ('global', 'map')),",
  "  map_id TEXT REFERENCES maps(id),",
  "  slot TEXT,",
  "  title_key TEXT NOT NULL REFERENCES title_catalog(key),",
  "  holder_name TEXT NOT NULL,",
  "  source_version TEXT NOT NULL,",
  "  UNIQUE (scope, map_id, slot, title_key, holder_name)",
  ");",
  "",
  "CREATE INDEX title_catalog_scope_idx ON title_catalog(scope, availability);",
  "CREATE INDEX map_title_rewards_map_idx ON map_title_rewards(map_id, slot);",
  "CREATE INDEX historical_title_grants_map_idx ON historical_title_grants(map_id, title_key);",
  "",
];

for (const title of snapshot.titles) {
  lines.push(`INSERT INTO title_catalog (key, label, category, condition, availability, scope, display_kind, game_version) VALUES (${sql(title.key)}, ${sql(title.label)}, ${sql(title.category)}, ${sql(title.condition)}, ${sql(title.availability)}, ${sql(title.scope)}, ${sql(title.displayKind)}, ${sql(snapshot.gameVersion)});`);
}
for (const map of snapshot.maps) {
  lines.push(`INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES (${sql(map.mapId)}, ${sql(map.mapName)}, ${sql(map.gameVersion)}, ${sql(map.status)}, ${sql(snapshot.gameVersion)}, 1752537600000, 1752537600000) ON CONFLICT(id) DO UPDATE SET name = excluded.name, game_version = excluded.game_version, status = excluded.status, updated_at = excluded.updated_at;`);
}
for (const map of snapshot.maps) {
  for (const reward of map.rewards) {
    lines.push(`INSERT INTO map_title_rewards (map_id, slot, title_key, pioneer_prefixes_json) VALUES (${sql(map.mapId)}, ${sql(reward.slot)}, ${sql(reward.titleKey)}, ${sql(JSON.stringify(reward.slot === "pioneer" ? map.pioneerPrefixes : []))});`);
    for (const holderName of reward.holderNames) {
      lines.push(`INSERT INTO historical_title_grants (id, scope, map_id, slot, title_key, holder_name, source_version) VALUES (${sql(id(`map:${map.mapId}:${reward.slot}:${reward.titleKey}:${holderName}`))}, 'map', ${sql(map.mapId)}, ${sql(reward.slot)}, ${sql(reward.titleKey)}, ${sql(holderName)}, ${sql(snapshot.sourceVersion)});`);
    }
  }
}
for (const grant of snapshot.globalGrants) {
  lines.push(`INSERT INTO historical_title_grants (id, scope, map_id, slot, title_key, holder_name, source_version) VALUES (${sql(id(`global:${grant.titleKey}:${grant.holderName}`))}, 'global', NULL, NULL, ${sql(grant.titleKey)}, ${sql(grant.holderName)}, ${sql(snapshot.sourceVersion)});`);
}

await fs.writeFile(path.resolve(output), `${lines.join("\n")}\n`);
console.log(`Generated ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
