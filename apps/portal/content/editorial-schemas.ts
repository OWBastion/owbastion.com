import { z } from "zod";

const editorialMetadataSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(320),
  tags: z.array(z.string().trim().min(1).max(64)).max(12).default([]),
  updatedAt: z.coerce.date().optional(),
  cover: z.object({
    src: z.string().trim().min(1).max(512),
    alt: z.string().trim().min(1).max(160),
  }).optional(),
});

export const blogFrontmatterSchema = editorialMetadataSchema.extend({
  publishedAt: z.coerce.date(),
});

export const changelogFrontmatterSchema = editorialMetadataSchema.extend({
  // The Markdown parser reports a missing description as "".
  description: z.string().trim().max(320).transform((value) => value || undefined).optional(),
  releasedAt: z.coerce.date(),
  version: z.string().trim().min(1).max(64),
});
