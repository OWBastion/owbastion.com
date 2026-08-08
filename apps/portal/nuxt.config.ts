import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  devtools: {
    enabled: process.env.NODE_ENV === "development",

    timeline: {
      enabled: true
    }
  },
  modules: ["@nuxt/content", "nuxt-studio", "@nuxt/ui", "@nuxtjs/color-mode", "@nuxt/hints"],
  content: {
    experimental: {
      sqliteConnector: "native",
    },
  },
  studio: {
    route: "/_studio",
    dev: false,
    repository: {
      provider: "github",
      owner: "OWBastion",
      repo: "owbastion.com",
      branch: "main",
      rootDir: "apps/portal",
      private: false,
    },
  },
  css: ["~/assets/css/main.css"],
  colorMode: {
    preference: "light",
    fallback: "light",
    dataValue: "theme",
    storageKey: "owbastion-portal-theme",
  },
  compatibilityDate: "2026-07-14",
  app: {
    head: {
      htmlAttrs: { lang: "zh-CN" },
      meta: [
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#f5f4ef" },
      ],
    },
    // G-07: opacity-only page cross-fade; reduced-motion falls back via global CSS.
    pageTransition: { name: "page", mode: "out-in" },
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: "http://localhost:8787",
      localDevAuth: false,
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
