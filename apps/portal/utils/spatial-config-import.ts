export type SpatialConfigValue = Record<string, unknown>;

export type SpatialConfigImportSummary = {
  totalPositions: number;
  fields: Array<{ label: string; count: number }>;
};

export type SpatialConfigImportResult =
  | { ok: true; config: SpatialConfigValue; summary: SpatialConfigImportSummary }
  | { ok: false; error: string };

type Vector = [number, number, number];

const numberToken = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?";
const vectorCapture = `(?:Vector|vect)\\s*\\(\\s*(${numberToken})\\s*,\\s*(${numberToken})\\s*,\\s*(${numberToken})\\s*\\)`;
const scalarAliases = ["thirdPersonPosition", "heroRingPosition"] as const;

const fieldLabels: Record<string, string> = {
  bastionPositions: "Bastion 出生点",
  resetPosition: "重置点",
  endPosition: "终点",
  thirdPersonPosition: "第三人称点",
  creditsPosition: "结算点",
  portalPositions: "传送点",
  springboardPositions: "跳板点",
  controlCenterPositions: "占领中心点",
  controlJumpPositions: "占领跳跃点",
  controlRespawnPositions: "占领重生点",
};

function vectorFromMatch(match: RegExpExecArray, offset: number): Vector {
  return [Number(match[offset]), Number(match[offset + 1]), Number(match[offset + 2])];
}

function isVector(value: unknown): value is Vector {
  return Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

function isVectorList(value: unknown): value is Vector[] {
  return Array.isArray(value) && value.every(isVector);
}

function normalizeWorkshopAliases(source: string): string {
  return source
    .replaceAll("全局", "Global")
    .replaceAll("数组", "Array")
    .replaceAll("矢量", "Vector");
}

function collectArrayAssignmentVectors(source: string, field: string): Vector[] {
  const assignmentPattern = new RegExp(`(?:Global\\.)?${field}\\s*=\\s*Array\\s*\\(`, "g");
  const vectorPattern = new RegExp(vectorCapture, "g");
  const values: Vector[] = [];
  let assignment: RegExpExecArray | null;
  while ((assignment = assignmentPattern.exec(source))) {
    let depth = 1;
    let cursor = assignmentPattern.lastIndex;
    let quote: string | null = null;
    for (; cursor < source.length && depth > 0; cursor += 1) {
      const character = source[cursor];
      if (quote) {
        if (character === quote && source[cursor - 1] !== "\\") quote = null;
        continue;
      }
      if (character === "\"" || character === "'") quote = character;
      else if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
    }
    if (depth !== 0) continue;
    const body = source.slice(assignmentPattern.lastIndex, cursor - 1);
    let vector: RegExpExecArray | null;
    while ((vector = vectorPattern.exec(body))) values.push(vectorFromMatch(vector, 1));
    vectorPattern.lastIndex = 0;
    assignmentPattern.lastIndex = cursor;
  }
  return values;
}

function collectVectors(source: string, field: string): Vector[] {
  const indexed = new Map<number, Vector>();
  const indexedPattern = new RegExp(`(?:Global\\.)?${field}\\s*\\[\\s*(\\d+)\\s*\\]\\s*=\\s*${vectorCapture}\\s*;?`, "g");
  let match: RegExpExecArray | null;
  while ((match = indexedPattern.exec(source))) indexed.set(Number(match[1]), vectorFromMatch(match, 2));

  const values = [...indexed.entries()].sort(([left], [right]) => left - right).map(([, value]) => value);
  if (indexed.size > 0 && [...indexed.keys()].some((index, position) => index !== position)) return [];

  const directPattern = new RegExp(`(?:Global\\.)?${field}\\s*=\\s*${vectorCapture}\\s*;?`, "g");
  while ((match = directPattern.exec(source))) values.push(vectorFromMatch(match, 1));

  values.push(...collectArrayAssignmentVectors(source, field));

  const appendPattern = new RegExp(`Modify\\s+Global\\s+Variable\\s*\\(\\s*${field}\\s*,\\s*Append\\s+To\\s+Array\\s*,\\s*${vectorCapture}\\s*\\)\\s*;?`, "g");
  while ((match = appendPattern.exec(source))) values.push(vectorFromMatch(match, 1));
  return values;
}

function collectScalarVector(source: string, field: string): Vector | undefined {
  const pattern = new RegExp(`(?:Global\\.)?${field}\\s*=\\s*${vectorCapture}\\s*;?`, "g");
  let match: RegExpExecArray | null;
  let value: Vector | undefined;
  while ((match = pattern.exec(source))) value = vectorFromMatch(match, 1);
  return value;
}

function collectAxis(source: string): "x" | "y" | "z" | null | undefined {
  const pattern = /(?:Global\.)?controlRespawnAxis\s*=\s*(?:["']([xyz])["']|([012])|Axis\.([XYZ]))\s*;?/g;
  let match: RegExpExecArray | null;
  let value: "x" | "y" | "z" | null | undefined;
  while ((match = pattern.exec(source))) {
    const indexed = match[2] === undefined ? undefined : (["x", "y", "z"][Number(match[2])] as "x" | "y" | "z");
    value = (match[1] as "x" | "y" | "z" | undefined) ?? indexed ?? match[3]?.toLowerCase() as "x" | "y" | "z";
  }
  return value;
}

function collectThreshold(source: string): number | null | undefined {
  const pattern = new RegExp(`(?:Global\\.)?controlRespawnAxisThreshold\\s*=\\s*(${numberToken})\\s*;?`, "g");
  let match: RegExpExecArray | null;
  let value: number | null | undefined;
  while ((match = pattern.exec(source))) value = Number(match[1]);
  return value;
}

function summaryFor(config: SpatialConfigValue): SpatialConfigImportSummary {
  const fields: Array<{ label: string; count: number }> = [];
  const add = (key: string, value: unknown) => {
    const count = isVector(value) ? 1 : isVectorList(value) ? value.length : 0;
    if (count > 0) fields.push({ label: fieldLabels[key] ?? key, count });
    return count;
  };
  let totalPositions = 0;
  totalPositions += add("bastionPositions", config.bastionPositions);
  totalPositions += add("resetPosition", config.resetPosition);
  totalPositions += add("endPosition", config.endPosition);
  totalPositions += add("thirdPersonPosition", config.thirdPersonPosition);
  totalPositions += add("creditsPosition", config.creditsPosition);
  totalPositions += add("portalPositions", config.portalPositions);
  totalPositions += add("springboardPositions", config.springboardPositions);
  if (config.control && typeof config.control === "object") {
    const control = config.control as Record<string, unknown>;
    totalPositions += add("controlCenterPositions", control.centerPositions);
    totalPositions += add("controlJumpPositions", control.jumpPositions);
    totalPositions += add("controlRespawnPositions", control.respawnPositions);
  }
  return { totalPositions, fields };
}

export function parseSpatialConfigSource(source: string, existingConfig: SpatialConfigValue | null = null): SpatialConfigImportResult {
  const normalizedSource = normalizeWorkshopAliases(source);
  const trimmed = normalizedSource.trim();
  if (!trimmed) return { ok: false, error: "请粘贴游戏内的点位代码。" };

  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "空间配置必须是对象。" };
      const config = parsed as SpatialConfigValue;
      return { ok: true, config, summary: summaryFor(config) };
    } catch {
      return { ok: false, error: "无法解析内容，请粘贴游戏内 Vector 点位代码。" };
    }
  }

  const bastionPositions = collectVectors(normalizedSource, "bastionPosition");
  const resetPosition = collectScalarVector(normalizedSource, "resetPosition");
  const endPosition = collectScalarVector(normalizedSource, "endPosition");
  const thirdPersonPosition = scalarAliases.map((field) => collectScalarVector(normalizedSource, field)).find(isVector);
  const creditsPosition = collectScalarVector(normalizedSource, "creditsPosition");
  const missing = [
    bastionPositions.length === 0 ? "Bastion 出生点" : null,
    !resetPosition ? "重置点" : null,
    !endPosition ? "终点" : null,
    !thirdPersonPosition ? "第三人称点（或 heroRingPosition）" : null,
    !creditsPosition ? "结算点" : null,
  ].filter((value): value is string => value !== null);
  if (missing.length > 0) return { ok: false, error: `缺少必需点位：${missing.join("、")}。请粘贴同一张地图的完整定位代码。` };

  const controlCenterPositions = collectVectors(normalizedSource, "controlCenterPosition");
  const controlJumpPositions = collectVectors(normalizedSource, "controlJumpPosition");
  const controlRespawnPositions = collectVectors(normalizedSource, "controlRespawnPosition");
  const respawnAxis = collectAxis(normalizedSource);
  const respawnAxisThreshold = collectThreshold(normalizedSource);
  const hasControl = controlCenterPositions.length > 0 || controlJumpPositions.length > 0 || controlRespawnPositions.length > 0 || respawnAxis !== undefined || respawnAxisThreshold !== undefined;
  if (hasControl && ((respawnAxis === undefined) !== (respawnAxisThreshold === undefined))) {
    return { ok: false, error: "占领重生轴和阈值必须同时提供，或同时留空。" };
  }
  if (hasControl && respawnAxis !== null && respawnAxis !== undefined && controlRespawnPositions.length === 0) {
    return { ok: false, error: "配置了占领重生轴，但没有占领重生点。" };
  }

  const config: SpatialConfigValue = {
    bastionPositions,
    resetPosition,
    endPosition,
    thirdPersonPosition,
    creditsPosition,
    control: hasControl ? {
      centerPositions: controlCenterPositions,
      jumpPositions: controlJumpPositions,
      respawnPositions: controlRespawnPositions,
      respawnAxis: respawnAxis ?? null,
      respawnAxisThreshold: respawnAxisThreshold ?? null,
    } : null,
    portalPositions: collectVectors(normalizedSource, "portalPosition"),
    springboardPositions: collectVectors(normalizedSource, "springBoardPosition"),
    alternateStages: Array.isArray(existingConfig?.alternateStages) ? existingConfig.alternateStages : [],
  };
  return { ok: true, config, summary: summaryFor(config) };
}

export function formatWorkshopSpatialConfig(config: SpatialConfigValue | null): string {
  if (!config || !isVectorList(config.bastionPositions) || !isVector(config.resetPosition) || !isVector(config.endPosition) || !isVector(config.thirdPersonPosition) || !isVector(config.creditsPosition)) return "";
  const lines = config.bastionPositions.map((position, index) => `Global.bastionPosition[${index}] = Vector(${position.join(", ")});`);
  const addVector = (name: string, position: unknown) => { if (isVector(position)) lines.push(`Global.${name} = Vector(${position.join(", ")});`); };
  addVector("endPosition", config.endPosition);
  addVector("heroRingPosition", config.thirdPersonPosition);
  addVector("resetPosition", config.resetPosition);
  addVector("creditsPosition", config.creditsPosition);
  const control = config.control;
  if (control && typeof control === "object") {
    const values = control as Record<string, unknown>;
    const append = (field: string, positions: unknown) => { if (isVectorList(positions)) for (const position of positions) lines.push(`Modify Global Variable(${field}, Append To Array, Vector(${position.join(", ")}));`); };
    append("controlCenterPosition", values.centerPositions);
    append("controlJumpPosition", values.jumpPositions);
    append("controlRespawnPosition", values.respawnPositions);
    if (values.respawnAxis === "x" || values.respawnAxis === "y" || values.respawnAxis === "z") lines.push(`Global.controlRespawnAxis = ${["x", "y", "z"].indexOf(values.respawnAxis)};`);
    if (typeof values.respawnAxisThreshold === "number") lines.push(`Global.controlRespawnAxisThreshold = ${values.respawnAxisThreshold};`);
  }
  const appendArray = (field: string, positions: unknown) => { if (isVectorList(positions)) for (const position of positions) lines.push(`Modify Global Variable(${field}, Append To Array, Vector(${position.join(", ")}));`); };
  appendArray("portalPosition", config.portalPositions);
  appendArray("springBoardPosition", config.springboardPositions);
  return lines.join("\n");
}
