import { defineCollection, defineContentConfig } from "@nuxt/content";
import { blogFrontmatterSchema, changelogFrontmatterSchema } from "./content/editorial-schemas";

export default defineContentConfig({
  collections: {
    blog: defineCollection({
      type: "page",
      source: "blog/**/*.md",
      schema: blogFrontmatterSchema,
    }),
    changelog: defineCollection({
      type: "page",
      source: "changelog/**/*.md",
      schema: changelogFrontmatterSchema,
    }),
  },
});
