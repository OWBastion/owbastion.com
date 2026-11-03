import type { AdminReviewImportRequest } from "@owbastion/contracts";
import { parseCsv } from "./random-event-import";

export const maxReviewImportCommentLength = 500;
const requiredHeaders = ["ID", "提交时间", "提交人", "评分事件", "评分", "评论"] as const;
const shanghaiOffsetMs = 8 * 60 * 60 * 1000;

export type ReviewImportRow = { sourceId: number; submitter: string; eventName: string; rating: number; comment: string | null; createdAt: number };

const parseSubmittedDate = (value: string) => {
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() - shanghaiOffsetMs : null;
};

// Parses the legacy survey export. Every row is one review: the submitter label is not an
// identity, because the migration merged many visitors under one label.
export const parseReviewImport = async (input: AdminReviewImportRequest, hashRequest: (value: unknown) => Promise<string>) => {
  const sourceHash = await hashRequest(input.csv);
  const table = parseCsv(input.csv.replace(/^﻿/, ""));
  const errors: Array<{ row: number; message: string }> = [];
  const columns = requiredHeaders.map((header) => table[0]?.indexOf(header) ?? -1);
  if (columns.some((index) => index < 0)) return { sourceHash, rowCount: 0, rows: [] as ReviewImportRow[], errors: [{ row: 1, message: `表头必须包含：${requiredHeaders.join("、")}` }] };
  const [idColumn, dateColumn, submitterColumn, eventColumn, ratingColumn, commentColumn] = columns as [number, number, number, number, number, number];
  const rows: ReviewImportRow[] = [];
  const seenIds = new Set<number>();
  let rowCount = 0;
  table.slice(1).forEach((values, index) => {
    if (!values.some(Boolean)) return;
    rowCount += 1;
    const row = index + 2;
    const sourceId = Number(values[idColumn]);
    const createdAt = parseSubmittedDate(values[dateColumn] ?? "");
    const rating = Number(values[ratingColumn]);
    const submitter = values[submitterColumn] ?? "";
    const eventName = values[eventColumn] ?? "";
    const comment = (values[commentColumn] ?? "").trim();
    if (!Number.isSafeInteger(sourceId) || sourceId <= 0) return void errors.push({ row, message: "ID 无效" });
    if (createdAt === null) return void errors.push({ row, message: "提交时间格式应为 YYYY/MM/DD" });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return void errors.push({ row, message: "评分必须是 1 到 5 的整数" });
    if (!submitter || !eventName) return void errors.push({ row, message: "提交人和评分事件不能为空" });
    if (Array.from(comment).length > maxReviewImportCommentLength) return void errors.push({ row, message: `评论不能超过 ${maxReviewImportCommentLength} 字` });
    if (seenIds.has(sourceId)) return void errors.push({ row, message: "ID 重复" });
    seenIds.add(sourceId);
    rows.push({ sourceId, submitter, eventName, rating, comment: comment || null, createdAt });
  });
  return { sourceHash, rowCount, rows: rows.sort((a, b) => a.sourceId - b.sourceId), errors };
};
