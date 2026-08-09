const editorialRoutePrefixes = ["/blog", "/changelog"] as const;
const studioWorkspaceRoutes = ["/studio", "/_studio"] as const;

const normalizePath = (path: string) => {
  const pathname = path.split(/[?#]/, 1)[0] || "/";
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
};

export const isStudioEditorialRoute = (path: string) => {
  const normalizedPath = normalizePath(path);
  return editorialRoutePrefixes.some((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`));
};

export const isStudioVisibleRoute = (path: string) => {
  const normalizedPath = normalizePath(path);
  return isStudioEditorialRoute(normalizedPath) || studioWorkspaceRoutes.some((route) => normalizedPath === route);
};
