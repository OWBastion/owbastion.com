import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  devtools: { enabled: false },
  css: ["~/assets/css/main.css"],
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
});
