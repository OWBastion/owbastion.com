import type { H3Event } from "h3";
import { createError, getRequestURL, getRouterParam, readRawBody, setResponseHeader, setResponseStatus } from "h3";
import {
  isStudioEditorialMutationPath,
  isStudioGitBlobPayload,
  isStudioGitCommitPayload,
  isStudioGitCommitResponse,
  isStudioGitRefResponse,
  isStudioGitRefUpdatePayload,
  isStudioGitSha,
  isStudioGitTreePayload,
  isStudioGitTreeResponse,
  studioGitProxyTarget,
} from "~/utils/studio-auth-policy";
import { useStudioGitPublishSession, type StudioGitPublishState } from "~/server/utils/studio-git-session";

const githubApiOrigin = "https://api.github.com";
const githubRepositoryPath = "/repos/OWBastion/owbastion.com";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const invalidRequest = (statusMessage = "内容发布请求无效。"): never => {
  throw createError({ statusCode: 400, statusMessage });
};

const publishConflict = (): never => {
  throw createError({ statusCode: 409, statusMessage: "内容基于旧版本，未发布。" });
};

const unavailable = (): never => {
  throw createError({ statusCode: 502, statusMessage: "GitHub 内容服务暂不可用。" });
};

const parseJson = (body: string, onError = invalidRequest): unknown => {
  try {
    return JSON.parse(body);
  } catch {
    return onError();
  }
};

const parseResponseJson = async (response: Response): Promise<unknown> => {
  const body = await response.text();
  if (!response.ok) unavailable();
  return parseJson(body, unavailable);
};

const gitHubFetch = async (token: string, path: string, method = "GET", body?: string): Promise<Response> => {
  const headers = new Headers({
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "OWBastion-Portal-Studio",
  });
  if (body !== undefined) headers.set("content-type", "application/json");
  try {
    return await fetch(new URL(path, githubApiOrigin), { method, headers, body });
  } catch {
    throw createError({ statusCode: 502, statusMessage: "GitHub 内容服务暂不可用。" });
  }
};

const fetchGitHubJson = async (token: string, path: string) => parseResponseJson(await gitHubFetch(token, path));

const respondWithGitHub = async (event: H3Event, response: Response, body: string) => {
  setResponseStatus(event, response.status, response.statusText);
  setResponseHeader(event, "cache-control", "no-store");
  const contentType = response.headers.get("content-type");
  if (contentType) setResponseHeader(event, "content-type", contentType);
  return body;
};

const hasBasePublishState = (state: unknown): state is StudioGitPublishState & { mainTreeSha: string } => {
  if (!isRecord(state) || !isStudioGitSha(state.mainSha) || !isStudioGitSha(state.mainTreeSha)) return false;
  return true;
};

type BasePublishState = StudioGitPublishState & { mainTreeSha: string };
type TreePublishState = BasePublishState & { treeSha: string };
type CommitPublishState = TreePublishState & { commitSha: string };

const hasTreePublishState = (state: unknown): state is TreePublishState => hasBasePublishState(state) && isStudioGitSha(state.treeSha);

const hasCommitPublishState = (state: unknown): state is CommitPublishState => hasTreePublishState(state) && isStudioGitSha(state.commitSha);

const requireBasePublishState = (state: unknown): BasePublishState => {
  if (!hasBasePublishState(state)) publishConflict();
  return state as BasePublishState;
};

const requireTreePublishState = (state: unknown): TreePublishState => {
  if (!hasTreePublishState(state)) publishConflict();
  return state as TreePublishState;
};

const requireCommitPublishState = (state: unknown): CommitPublishState => {
  if (!hasCommitPublishState(state)) publishConflict();
  return state as CommitPublishState;
};

const readPublishSession = async (event: H3Event) => {
  const session = await useStudioGitPublishSession(event);
  return { session, state: session.data.publish as unknown };
};

type GitTreeSnapshot = Map<string, string>;

const treeSnapshot = (payload: unknown): GitTreeSnapshot => {
  if (!isRecord(payload)) unavailable();
  const treePayload = payload as JsonRecord;
  if (treePayload.truncated !== false || !Array.isArray(treePayload.tree)) unavailable();
  const snapshot = new Map<string, string>();
  for (const entry of treePayload.tree as unknown[]) {
    if (!isRecord(entry)) unavailable();
    const treeEntry = entry as JsonRecord;
    if (typeof treeEntry.path !== "string" || typeof treeEntry.type !== "string" || typeof treeEntry.mode !== "string") unavailable();
    const path = treeEntry.path as string;
    const type = treeEntry.type as string;
    const mode = treeEntry.mode as string;
    if (type === "tree") continue;
    if (typeof treeEntry.sha !== "string") unavailable();
    snapshot.set(path, `${type}:${mode}:${treeEntry.sha}`);
  }
  return snapshot;
};

const changedTreePaths = (before: GitTreeSnapshot, after: GitTreeSnapshot) => {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((path) => before.get(path) !== after.get(path));
};

const validateFinalPublish = async (token: string, state: StudioGitPublishState & { treeSha: string; commitSha: string }) => {
  const currentRef = await fetchGitHubJson(token, `${githubRepositoryPath}/git/refs/heads/main`);
  if (!isStudioGitRefResponse(currentRef) || currentRef.object.sha !== state.mainSha) publishConflict();

  const currentCommit = await fetchGitHubJson(token, `${githubRepositoryPath}/git/commits/${state.mainSha}`);
  if (!isRecord(currentCommit) || !isRecord(currentCommit.tree) || !isStudioGitSha(currentCommit.tree.sha) || currentCommit.tree.sha !== state.mainTreeSha) publishConflict();

  const proposedCommit = await fetchGitHubJson(token, `${githubRepositoryPath}/git/commits/${state.commitSha}`);
  if (!isStudioGitCommitResponse(proposedCommit, state.commitSha, state.treeSha, state.mainSha)) publishConflict();

  const [beforeTree, afterTree] = await Promise.all([
    fetchGitHubJson(token, `${githubRepositoryPath}/git/trees/${state.mainTreeSha}?recursive=1`),
    fetchGitHubJson(token, `${githubRepositoryPath}/git/trees/${state.treeSha}?recursive=1`),
  ]);
  const changedPaths = changedTreePaths(treeSnapshot(beforeTree), treeSnapshot(afterTree));
  if (changedPaths.some((path) => !isStudioEditorialMutationPath(path))) invalidRequest("内容路径超出编辑范围。");
};

export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event);
  const method = event.method.toUpperCase();
  const path = getRouterParam(event, "path") || "";
  const targetPath = studioGitProxyTarget(path, method, requestUrl.searchParams);
  if (!targetPath) throw createError({ statusCode: 404, statusMessage: "Not found" });

  const token = process.env.STUDIO_GITHUB_TOKEN;
  if (!token) throw createError({ statusCode: 503, statusMessage: "内容发布服务暂未完成服务端配置。" });

  const operation = targetPath.slice(`${githubRepositoryPath}/`.length);
  const commitRead = operation.match(/^git\/commits\/([0-9a-f]{40})$/i);
  const body = method !== "GET" && method !== "HEAD" ? await readRawBody(event) : undefined;

  if (operation === "git/refs/heads/main" && method === "GET") {
    const response = await gitHubFetch(token, `${targetPath}${requestUrl.search}`);
    const responseBody = await response.text();
    if (response.ok) {
      const payload = parseJson(responseBody, unavailable);
      if (!isStudioGitRefResponse(payload)) unavailable();
      const refPayload = payload as { object: { sha: string } };
      const { session } = await readPublishSession(event);
      await session.update({ publish: { mainSha: refPayload.object.sha } });
    }
    return respondWithGitHub(event, response, responseBody);
  }

  if (commitRead && method === "GET") {
    const { session, state } = await readPublishSession(event);
    if (!isRecord(state) || state.mainSha !== commitRead[1]) throw createError({ statusCode: 404, statusMessage: "Not found" });
    const response = await gitHubFetch(token, `${targetPath}${requestUrl.search}`);
    const responseBody = await response.text();
    if (response.ok) {
      const payload = parseJson(responseBody, unavailable);
      if (!isRecord(payload)) unavailable();
      const commitPayload = payload as JsonRecord;
      if (commitPayload.sha !== commitRead[1] || !isRecord(commitPayload.tree)) unavailable();
      const commitTreePayload = commitPayload.tree as JsonRecord;
      if (!isStudioGitSha(commitTreePayload.sha)) unavailable();
      const commitTree = commitTreePayload as { sha: string };
      await session.update({ publish: { mainSha: commitRead[1], mainTreeSha: commitTree.sha } });
    }
    return respondWithGitHub(event, response, responseBody);
  }

  const payload = parseJson(body || "{}");
  if (operation === "git/blobs" && method === "POST") {
    const { state } = await readPublishSession(event);
    requireBasePublishState(state);
    if (!isStudioGitBlobPayload(payload)) invalidRequest();
    const response = await gitHubFetch(token, targetPath, method, body);
    const responseBody = await response.text();
    if (response.ok) {
      const responsePayload = parseJson(responseBody, unavailable);
      if (!isRecord(responsePayload) || !isStudioGitSha(responsePayload.sha)) unavailable();
    }
    return respondWithGitHub(event, response, responseBody);
  }

  if (operation === "git/trees" && method === "POST") {
    const { session, state } = await readPublishSession(event);
    const baseState = requireBasePublishState(state);
    if (!isStudioGitTreePayload(payload, baseState.mainTreeSha)) invalidRequest("内容路径超出编辑范围。");
    const response = await gitHubFetch(token, targetPath, method, body);
    const responseBody = await response.text();
    if (response.ok) {
      const responsePayload = parseJson(responseBody, unavailable);
      if (!isStudioGitTreeResponse(responsePayload)) unavailable();
      const treeResponse = responsePayload as { sha: string };
      await session.update({ publish: { mainSha: baseState.mainSha, mainTreeSha: baseState.mainTreeSha, treeSha: treeResponse.sha } });
    }
    return respondWithGitHub(event, response, responseBody);
  }

  if (operation === "git/commits" && method === "POST") {
    const { session, state } = await readPublishSession(event);
    const treeState = requireTreePublishState(state);
    if (!isStudioGitCommitPayload(payload, treeState.treeSha, treeState.mainSha)) invalidRequest();
    const response = await gitHubFetch(token, targetPath, method, body);
    const responseBody = await response.text();
    if (response.ok) {
      const responsePayload = parseJson(responseBody, unavailable);
      if (!isRecord(responsePayload)) unavailable();
      const commitResponse = responsePayload as JsonRecord;
      const responseSha = commitResponse.sha;
      if (!isStudioGitSha(responseSha) || !isStudioGitCommitResponse(responsePayload, responseSha, treeState.treeSha, treeState.mainSha)) unavailable();
      await session.update({ publish: { mainSha: treeState.mainSha, mainTreeSha: treeState.mainTreeSha, treeSha: treeState.treeSha, commitSha: responseSha } });
    }
    return respondWithGitHub(event, response, responseBody);
  }

  if (operation === "git/refs/heads/main" && method === "PATCH") {
    const { session, state } = await readPublishSession(event);
    const commitState = requireCommitPublishState(state);
    if (!isStudioGitRefUpdatePayload(payload, commitState.commitSha)) invalidRequest();
    await validateFinalPublish(token, commitState);
    const response = await gitHubFetch(token, targetPath, method, body);
    const responseBody = await response.text();
    if (response.ok) {
      const responsePayload = parseJson(responseBody, unavailable);
      if (!isStudioGitRefResponse(responsePayload)) unavailable();
      const refResponse = responsePayload as { object: { sha: string } };
      if (refResponse.object.sha !== commitState.commitSha) unavailable();
      await session.clear();
    }
    return respondWithGitHub(event, response, responseBody);
  }

  const response = await gitHubFetch(token, `${targetPath}${requestUrl.search}`, method, body);
  return respondWithGitHub(event, response, await response.text());
});
