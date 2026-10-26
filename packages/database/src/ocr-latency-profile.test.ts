import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import { describe, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, deliverOcrFixture, fakeEvidenceBucket, installSchema, seedMap } from "./ocr-test-harness";
import { seedScaledCandidates, seedSubmissionPlayer, seedOcrPendingSubmission, seedReviewableSubmission, nonMatchingOcrResponse, matchingOcrResponse } from "../test/ocr-catalog-fixtures";

const profile = vi.hoisted(() => ({
  measure: <T>(name: string, operation: () => T): T => operation(),
}));
vi.mock("./challenge-catalog-service", async (original) => {
  const module = await original<typeof import("./challenge-catalog-service")>();
  return { ...module, createChallengeCatalogServices: (...args: Parameters<typeof module.createChallengeCatalogServices>) => {
    const services = module.createChallengeCatalogServices(...args);
    const originalFetch = services.fetchPlayerAutoMatchChallenges;
    services.fetchPlayerAutoMatchChallenges = (...input) => profile.measure("catalog", () => originalFetch(...input));
    return services;
  } };
});
vi.mock("./challenge-snapshot-service", async (original) => {
  const module = await original<typeof import("./challenge-snapshot-service")>();
  return { ...module, createChallengeSnapshotServices: (...args: Parameters<typeof module.createChallengeSnapshotServices>) => {
    const services = module.createChallengeSnapshotServices(...args);
    const originalResolve = services.batchResolveAutomaticSnapshots;
    services.batchResolveAutomaticSnapshots = (...input) => profile.measure("snapshots", () => originalResolve(...input));
    return services;
  } };
});
vi.mock("./canonical-challenge-service", async (original) => {
  const module = await original<typeof import("./canonical-challenge-service")>();
  return { ...module, createCanonicalChallengeServices: (...args: Parameters<typeof module.createCanonicalChallengeServices>) => {
    const services = module.createCanonicalChallengeServices(...args);
    const originalPlan = services.batchPlanCanonicalChallenges;
    services.batchPlanCanonicalChallenges = (...input) => profile.measure("canonical", () => originalPlan(...input));
    return services;
  } };
});
vi.mock("./ocr-auto-match", async (original) => {
  const module = await original<typeof import("./ocr-auto-match")>();
  return { ...module, matchOcrAgainstChallenges: (...args: Parameters<typeof module.matchOcrAgainstChallenges>) => profile.measure("conditions-quality", () => module.matchOcrAgainstChallenges(...args)) };
});

// Run: OCR_LATENCY_PROFILE=1 pnpm exec vitest run packages/database/src/ocr-latency-profile.test.ts
// Opt-in measurements use synthetic evidence only. Timings never act as CI assertions.
describe.runIf(process.env.OCR_LATENCY_PROFILE === "1")("OCR and review latency profile", () => {
  it("reports cold request phases for matching and non-matching catalogs", async () => {
    const context = new AsyncLocalStorage<string>();
    const rows: object[] = [];
    for (const path of ["ocr", "preview"] as const) for (const candidates of [10, 100]) for (const matching of [false, true]) {
      const samples: Array<Record<string, number>> = [];
      const outputHashes = new Set<string>();
      for (let iteration = 0; iteration < 12; iteration++) {
        const { database, sqlite } = createD1();
        installSchema(sqlite);
        seedMap(sqlite, "map.scale");
        seedScaledCandidates(sqlite, "map.scale", candidates);
        seedSubmissionPlayer(sqlite, "player.profile", "binding.profile");
        const response = matching ? matchingOcrResponse() : nonMatchingOcrResponse();
        if (path === "ocr") seedOcrPendingSubmission(sqlite, "submission.profile", "binding.profile");
        else seedReviewableSubmission(sqlite, "submission.profile", "binding.profile", response);
        const metrics: Record<string, number> = {};
        const add = (key: string, value: number) => { metrics[key] = (metrics[key] ?? 0) + value; };
        profile.measure = (name, operation) => context.run(name, () => {
          const start = performance.now();
          const result = operation();
          if (result instanceof Promise) return result.finally(() => add(`${name}.wallMs`, performance.now() - start)) as typeof result;
          add(`${name}.wallMs`, performance.now() - start);
          return result;
        });
        const wrap = (statement: D1PreparedStatement): D1PreparedStatement => new Proxy(statement, { get(target, property) {
          if (property === "bind") return (...values: unknown[]) => wrap(target.bind(...values));
          if (["all", "first", "raw", "run"].includes(String(property))) return (...args: unknown[]) => {
            const phase = context.getStore() ?? "other";
            const start = performance.now();
            try { return Reflect.get(target, property).apply(target, args); }
            finally { add("statements", 1); add("d1Ms", performance.now() - start); add(`${phase}.statements`, 1); add(`${phase}.d1Ms`, performance.now() - start); }
          };
          return Reflect.get(target, property);
        } });
        const measuredDatabase = new Proxy(database, { get(target, property) {
          if (property === "prepare") return (sql: string) => wrap(target.prepare(sql));
          return Reflect.get(target, property);
        } });
        vi.stubGlobal("fetch", vi.fn(async () => Response.json(response)));
        const services = createPlatformServices(measuredDatabase, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        const start = performance.now();
        const cpuStart = process.cpuUsage();
        let output: unknown;
        try {
          if (path === "ocr") await deliverOcrFixture(services, sqlite, { submissionId: "submission.profile", objectKey: "evidence/submission.profile.png", attempt: 1, requestId: "request.profile", jobId: "job.profile" });
          else output = await services.previewSubmissionReview({ submissionId: "submission.profile" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" });
          metrics.wallMs = performance.now() - start;
          const cpu = process.cpuUsage(cpuStart);
          metrics.cpuMs = (cpu.user + cpu.system) / 1000;
          if (path === "ocr") {
            const result = sqlite.prepare("SELECT match_json FROM ocr_results WHERE id = 'job.profile'").get() as { match_json: string };
            const decision = JSON.parse(result.match_json);
            output = decision;
            metrics.matchedCandidates = decision.candidates?.filter((candidate: { matched: boolean }) => candidate.matched).length ?? 0;
          }
          if (iteration >= 2) {
            samples.push(metrics);
            outputHashes.add(createHash("sha256").update(JSON.stringify(output)).digest("hex"));
          }
        } finally { vi.unstubAllGlobals(); sqlite.close(); }
      }
      const keys = [...new Set(samples.flatMap(Object.keys))];
      const mean = Object.fromEntries(keys.map((key) => [key, Number((samples.reduce((sum, sample) => sum + (sample[key] ?? 0), 0) / samples.length).toFixed(3))]));
      rows.push({ path, candidates, matching, outputHashes: [...outputHashes], ...mean });
    }
    process.stdout.write(`OCR_LATENCY_PROFILE ${JSON.stringify(rows)}\n`);
  }, 60_000);
});
