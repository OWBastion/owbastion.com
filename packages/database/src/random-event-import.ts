import { randomEventCompositeCategory } from "@owbastion/domain";
import type { AdminRandomEventCreateRequest, AdminRandomEventImportRequest } from "@owbastion/contracts";

export type EventImportRow = Omit<AdminRandomEventCreateRequest, "contractVersion">;

export const eventImportHeaders = ["事件名称", "事件效果", "事件类别", "稀有度级别", "类别概率", "内置冷却", "持续时间（秒）", "权重", "组内总权重", "组内个数", "单次失败率(Q)", "保底触发率", "最终出现概率", "全局出现概率", "版本", "效果类型", "事件状态"];

const parseCsv = (csv: string) => {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < csv.length; index += 1) { const char = csv[index]; const next = csv[index + 1]; if (quoted) { if (char === '"' && next === '"') { field += '"'; index += 1; } else if (char === '"') quoted = false; else field += char; } else if (char === '"') quoted = true; else if (char === ",") { row.push(field.trim()); field = ""; } else if (char === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; } else if (char !== "\r") field += char; }
  if (quoted) throw new Error("CSV_QUOTE_INVALID"); if (field || row.length) { row.push(field.trim()); rows.push(row); } return rows;
};

export const parseEventImport = async (input: AdminRandomEventImportRequest, hashRequest: (value: unknown) => Promise<string>) => {
  const rows = parseCsv(input.csv.replace(/^\uFEFF/, "")); const errors: Array<{ row: number; message: string }> = [];
  if (!rows.length || eventImportHeaders.some((header, index) => rows[0][index] !== header)) return { sourceHash: await hashRequest(input.csv), rows: [] as EventImportRow[], errors: [{ row: 1, message: `表头必须为：${eventImportHeaders.join("、")}` }] };
  const parsed: EventImportRow[] = [];
  rows.slice(1).forEach((values, index) => { const rowNumber = index + 2; if (!values.some(Boolean)) return; if (values[2] === randomEventCompositeCategory) { errors.push({ row: rowNumber, message: "复合事件不参与 CSV 导入，请改用管理端事件编辑器创建" }); return; } const number = (value: string) => value === "" ? null : Number(value); const status = values[16] === "已实装" ? "implemented" : values[16] === "已移除" ? "removed" : values[16] === "开发中" ? "development" : ""; const candidate = { name: values[0], description: values[1], category: values[2], cooldownSeconds: number(values[5]), durationSeconds: number(values[6]), weight: number(values[7]), gameVersion: values[14], eventGroup: rows[0][17] === "事件组" ? values[17]?.trim() || null : null, effectTags: values[15] ? values[15].split(/[、,]/).map((tag) => tag.trim()).filter(Boolean) : [], releaseStatus: status, challengeLinks: [] }; const valid = candidate.name && candidate.category && candidate.description && candidate.gameVersion && status && [candidate.cooldownSeconds, candidate.durationSeconds, candidate.weight].every((value) => value === null || Number.isFinite(value) && value >= 0) && Number.isInteger(candidate.durationSeconds ?? 0); if (!valid) errors.push({ row: rowNumber, message: "字段缺失、状态或数值格式无效" }); else parsed.push(candidate as EventImportRow); });
  const duplicates = new Set<string>(); parsed.forEach((item) => { if (duplicates.has(item.name)) errors.push({ row: rows.findIndex((values) => values[0] === item.name) + 1, message: "文件内事件名称重复" }); duplicates.add(item.name); });
  return { sourceHash: await hashRequest(input.csv), rows: parsed, errors };
};
