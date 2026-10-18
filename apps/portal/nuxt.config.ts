import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";

// Git-managed editorial Markdown is compiled into the prerendered routes below;
// the slugs come from the files themselves, never from a runtime content store.
const editorialRoutes = ["/blog", "/changelog"];
for (const kind of ["blog", "changelog"]) {
  const directory = fileURLToPath(new URL(`./content/${kind}`, import.meta.url));
  for (const file of readdirSync(directory, { recursive: true }) as string[]) {
    if (file.endsWith(".md")) editorialRoutes.push(`/${kind}/${file.slice(0, -".md".length).replaceAll("\\", "/")}`);
  }
}

export default defineNuxtConfig({
  devtools: {
    enabled: process.env.NODE_ENV === "development",

    timeline: {
      enabled: true
    }
  },
  modules: ["./modules/editorial", "@nuxtjs/mdc", "@nuxt/ui", "@nuxtjs/color-mode", "@nuxt/hints"],
  mdc: {
    // The editorial generator module wires Shiki itself; the module-level
    // highlighter API route and its Oniguruma virtual bundle are not needed.
    highlight: false,
  },
  components: {
    dirs: [
      { path: "~/components" },
      // Editorial components keep their historical unprefixed global names.
      { path: "~/components/content", pathPrefix: false, global: true },
    ],
  },
  nitro: {
    storage: { cache: { driver: "memory" } },
    prerender: {
      failOnError: true,
      routes: editorialRoutes,
    },
  },
  routeRules: {
    "/submissions/**": { redirect: { to: "/me/submissions/**", statusCode: 302 } },
    "/admin": { ssr: false },
    "/admin/**": { ssr: false },
    "/admin/titles": { redirect: { to: "/admin/title-migration", statusCode: 302 } },
    "/admin/map-titles": { redirect: { to: "/admin/achievements/map-challenges", statusCode: 302 } },
    "/blog": { prerender: true },
    "/blog/**": { prerender: true },
    "/changelog": { prerender: true },
    "/changelog/**": { prerender: true },
  },
  css: ["~/assets/css/main.css"],
  colorMode: {
    preference: "dark",
    fallback: "dark",
    dataValue: "theme",
    storageKey: "owbastion-portal-theme",
  },
  compatibilityDate: "2026-07-14",
  app: {
    head: {
      htmlAttrs: { lang: "zh-CN" },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#0c1310" },
      ],
      link: [
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&display=swap" },
      ],
    },
    // G-07: opacity-only page cross-fade; reduced-motion falls back via global CSS.
    pageTransition: { name: "page", mode: "out-in" },
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: "http://localhost:8787",
      localDevAuth: false,
      // Canonical origin for prerendered SEO metadata; prerendering has no
      // request URL, so canonical/og:url must not be derived from the request.
      siteUrl: "https://owbastion.com",
    },
  },
  vite: {
    optimizeDeps: {
      include: [
        '@tanstack/vue-table',
        '@vueuse/core',
      ]
    }
  }
});
