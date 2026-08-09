import type { H3Event } from "h3";
import { getRequestProtocol, useSession } from "h3";
import { useRuntimeConfig } from "#imports";

export type StudioGitPublishState = {
  mainSha: string;
  mainTreeSha?: string;
  treeSha?: string;
  commitSha?: string;
};

export const useStudioGitPublishSession = (event: H3Event) => useSession(event, {
  name: "studio-git-publish",
  password: useRuntimeConfig(event).studio?.auth?.sessionSecret,
  cookie: {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: getRequestProtocol(event) === "https",
  },
});
