import fs from "node:fs/promises";
import path from "node:path";

type OpenApiDocument = { servers?: Array<{ url?: string }>; paths?: Record<string, Record<string, unknown>> };

export type CloudflareOperation = { endpoint: string; host: string; method: string };
type CloudflareResponse = { success?: boolean; errors?: Array<{ message?: string }> };
type CloudflareStoredOperation = CloudflareOperation & { operation_id?: string };
type CloudflareOperationsResponse = CloudflareResponse & {
  result?: CloudflareStoredOperation[];
  result_info?: { page?: number; total_pages?: number };
};
type DeploymentResult = CloudflareResponse & { created: number; skipped: number };

const supportedMethods = new Set(["get", "post", "put", "patch", "delete", "head", "options", "connect", "trace"]);
const apiGatewayOperationsUrl = (zoneId: string) => `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/api_gateway/operations`;
const authorizationHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

const parseCloudflareResponse = async <T extends CloudflareResponse>(response: Response, action: string) => {
  const body = await response.json() as T;
  if (!response.ok || body.success !== true) {
    const detail = body.errors?.map((error) => error.message).filter(Boolean).join("; ") || `HTTP ${response.status}`;
    throw new Error(`Cloudflare API endpoint ${action} failed: ${detail}`);
  }
  return body;
};

export const operationsFromOpenApi = (document: OpenApiDocument, hostOverride?: string): CloudflareOperation[] => {
  const host = hostOverride ?? (document.servers?.[0]?.url ? new URL(document.servers[0].url).hostname : undefined);
  if (!host) throw new Error("OpenAPI document must define servers[0].url or --host");
  const operations = Object.entries(document.paths ?? {}).flatMap(([endpoint, pathItem]) => Object.keys(pathItem)
    .filter((method) => supportedMethods.has(method.toLowerCase()))
    .map((method) => ({ endpoint, host, method: method.toUpperCase() })));
  if (operations.length === 0) throw new Error("OpenAPI document does not contain any operations");
  return operations.sort((left, right) => `${left.host}${left.endpoint}${left.method}`.localeCompare(`${right.host}${right.endpoint}${right.method}`));
};

const operationKey = (operation: CloudflareOperation) => {
  let variableIndex = 0;
  const endpoint = operation.endpoint.replace(/\{[^}]+\}/g, () => `{var${++variableIndex}}`);
  return `${operation.host.toLowerCase()} ${operation.method.toUpperCase()} ${endpoint}`;
};

export const listOperations = async (zoneId: string, token: string, fetcher = fetch) => {
  const operations: CloudflareStoredOperation[] = [];
  const perPage = 50;
  for (let page = 1; ; page += 1) {
    const url = new URL(apiGatewayOperationsUrl(zoneId));
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    const response = await fetcher(url.toString(), { method: "GET", headers: authorizationHeaders(token) });
    const body = await parseCloudflareResponse<CloudflareOperationsResponse>(response, "operation inventory read");
    const pageOperations = body.result ?? [];
    operations.push(...pageOperations);
    const totalPages = body.result_info?.total_pages;
    if (pageOperations.length === 0 || (totalPages !== undefined ? page >= totalPages : pageOperations.length < perPage)) break;
  }
  return operations;
};

export const deployOperations = async (zoneId: string, token: string, operations: CloudflareOperation[], fetcher = fetch): Promise<DeploymentResult> => {
  const existingOperations = await listOperations(zoneId, token, fetcher);
  const existingKeys = new Set(existingOperations.map(operationKey));
  const missingOperations = operations.filter((operation) => {
    const key = operationKey(operation);
    if (existingKeys.has(key)) return false;
    existingKeys.add(key);
    return true;
  });
  if (missingOperations.length === 0) return { success: true, created: 0, skipped: operations.length };

  const response = await fetcher(apiGatewayOperationsUrl(zoneId), {
    method: "POST",
    headers: authorizationHeaders(token),
    body: JSON.stringify(missingOperations),
  });
  const body = await parseCloudflareResponse<CloudflareResponse>(response, "deployment");
  return { ...body, created: missingOperations.length, skipped: operations.length - missingOperations.length };
};

const argumentValue = (args: string[], flag: string) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const main = async () => {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: pnpm deploy:api-endpoints [--spec <path>] [--host <hostname>]");
    return;
  }
  const specPath = path.resolve(argumentValue(args, "--spec") ?? "docs/api/openapi.json");
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!zoneId) throw new Error("CLOUDFLARE_ZONE_ID is required");
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required");
  const document = JSON.parse(await fs.readFile(specPath, "utf8")) as OpenApiDocument;
  const operations = operationsFromOpenApi(document, argumentValue(args, "--host"));
  const result = await deployOperations(zoneId, token, operations);
  console.log(`Deployed ${result.created} new API Shield endpoint operations and kept ${result.skipped} existing operations from ${path.relative(process.cwd(), specPath)}.`);
};

if (import.meta.main) main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
