import { getRequestURL } from "h3";
import { sanitizeStudioSessionResponse } from "~/server/utils/studio-auth";

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook("beforeResponse", (event, response) => {
    if (getRequestURL(event).pathname !== "/__nuxt_studio/auth/session") return;
    response.body = sanitizeStudioSessionResponse(response.body);
  });
});
