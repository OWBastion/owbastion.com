import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  devtools: { enabled: process.env.NODE_ENV === "development" },
  modules: ["@nuxt/ui", "@nuxtjs/color-mode", "@nuxt/hints"],
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
