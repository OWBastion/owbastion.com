import { asc, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { attachments } from "./schema";

/** Object key of each submission's latest attachment. */
export async function latestEvidenceKeys(db: DrizzleD1Database<any>, submissionIds: string[]) {
  if (!submissionIds.length) return new Map<string, string | null>();
  const rows = await db.select({ submissionId: attachments.submissionId, objectKey: attachments.objectKey }).from(attachments).where(inArray(attachments.submissionId, submissionIds)).orderBy(asc(attachments.createdAt));
  return new Map(rows.map((row) => [row.submissionId, row.objectKey]));
}
