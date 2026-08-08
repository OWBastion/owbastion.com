import { createError, getRequestURL, getRouterParam, readRawBody, setResponseHeader, setResponseStatus } from "h3";
import { studioGitProxyTarget } from "~/server/utils/studio-auth";

const contentRoot = "apps/portal";

const isPortalPath = (path: unknown) => {
  if (typeof path !== "string") return false;
  const segments = path.split("/");
  return (path === contentRoot || path.startsWith(`${contentRoot}/`)) && !segments.includes("..") && !segments.includes(".");
};

export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event);
  const method = event.method.toUpperCase();
  const path = getRouterParam(event, "path") || "";
  const targetPath = studioGitProxyTarget(path, method, requestUrl.searchParams);
  if (!targetPath) throw createError({ statusCode: 404, statusMessage: "Not found" });

  const token = process.env.STUDIO_GITHUB_TOKEN;
  if (!token) throw createError({ statusCode: 503, statusMessage: "内容发布服务暂未完成服务端配置。" });

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await readRawBody(event);
    if (targetPath.endsWith("/git/trees")) {
      try {
        const payload = JSON.parse(body || "{}");
        if (!Array.isArray(payload.tree) || payload.tree.some((entry: { path?: unknown }) => !isPortalPath(entry.path))) {
          throw createError({ statusCode: 400, statusMessage: "内容路径超出编辑范围。" });
        }
      } catch (error) {
        if (error && typeof error === "object" && "statusCode" in error) throw error;
        throw createError({ statusCode: 400, statusMessage: "内容发布请求无效。" });
      }
    }
  }

  const headers = new Headers({
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "user-agent": "OWBastion-Portal-Studio",
  });
  if (body !== undefined) headers.set("content-type", "application/json");

  let response: Response;
  try {
    response = await fetch(new URL(`${targetPath}${requestUrl.search}`, "https://api.github.com"), {
      method,
      headers,
      body,
    });
  } catch {
    throw createError({ statusCode: 502, statusMessage: "GitHub 内容服务暂不可用。" });
  }

  setResponseStatus(event, response.status, response.statusText);
  setResponseHeader(event, "cache-control", "no-store");
  const contentType = response.headers.get("content-type");
  if (contentType) setResponseHeader(event, "content-type", contentType);
  return await response.text();
});
