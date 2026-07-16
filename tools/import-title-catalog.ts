import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readTitleCatalogSnapshot, renderCatalogImportSql, snapshotHash } from "./title-catalog.ts";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const valueAfter = (flag: string) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const snapshotPath = valueAfter("--snapshot");
const database = valueAfter("--database") ?? "DB";
const remote = args.includes("--remote");
const dryRun = args.includes("--dry-run");

if (!snapshotPath || args.includes("--help")) {
  console.log("Usage: pnpm db:import:catalog --snapshot <path> [--database <name>] [--remote] [--dry-run]");
  process.exit(snapshotPath ? 0 : 1);
}

const quoteSql = (value: string) => `'${value.replaceAll("'", "''")}'`;
const wrangler = async (extraArgs: string[]) => {
  const flags = remote ? ["--remote"] : ["--local"];
  return execFileAsync("pnpm", ["exec", "wrangler", "d1", "execute", database, ...flags, ...extraArgs], { maxBuffer: 10 * 1024 * 1024 });
};

const main = async () => {
  const content = await fs.readFile(path.resolve(snapshotPath!), "utf8");
  const snapshot = readTitleCatalogSnapshot(JSON.parse(content));
  const hash = snapshotHash(content);
  const counts = {
    titles: snapshot.titles.length,
    maps: snapshot.maps.length,
    rewards: snapshot.maps.reduce((count, map) => count + map.rewards.length, 0),
    historicalGrants: snapshot.maps.reduce((count, map) => count + map.rewards.reduce((rewardCount, reward) => rewardCount + reward.holderNames.length, 0), 0) + snapshot.globalGrants.length,
  };

  if (dryRun) {
    const sql = renderCatalogImportSql(snapshot, hash, Date.now());
    console.log(JSON.stringify({ mode: "dry-run", sourceVersion: snapshot.sourceVersion, snapshotHash: hash, counts, sqlBytes: Buffer.byteLength(sql) }, null, 2));
    return;
  }

  const query = `SELECT source_version, snapshot_hash FROM catalog_imports WHERE source_version = ${quoteSql(snapshot.sourceVersion)} OR snapshot_hash = ${quoteSql(hash)} LIMIT 1`;
  let queryOutput: string;
  try {
    queryOutput = (await wrangler(["--command", query, "--json"])).stdout;
  } catch (error) {
    throw new Error(`无法读取 catalog_imports，请先执行 D1 migrations：${error instanceof Error ? error.message : String(error)}`);
  }
  if (queryOutput.includes(snapshot.sourceVersion) || queryOutput.includes(hash)) {
    console.log(`Catalog snapshot ${snapshot.sourceVersion} 已导入，跳过。`);
    return;
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "owbastion-catalog-import-"));
  const sqlPath = path.join(tempDir, "catalog-import.sql");
  try {
    await fs.writeFile(sqlPath, renderCatalogImportSql(snapshot, hash, Date.now()));
    await wrangler(["--file", sqlPath]);
    console.log(`Catalog snapshot ${snapshot.sourceVersion} 导入完成：${JSON.stringify(counts)}`);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
