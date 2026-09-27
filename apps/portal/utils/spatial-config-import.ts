import { agentSpatialConfigSchema } from "@owbastion/contracts";

export type SpatialConfigValue = Record<string, unknown>;
export type SpatialConfigScope = "single" | "composite-route" | "composite-stage";

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
  setupDetection: "初始阶段检测点",
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
  while (assignmentPattern.exec(source)) {
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
  let totalPositions = 0;
  const add = (key: string, value: unknown, stageId?: string) => {
    const count = isVector(value) ? 1 : isVectorList(value) ? value.length : 0;
    if (count > 0) fields.push({ label: `${stageId ? `${stageId} · ` : ""}${fieldLabels[key] ?? key}`, count });
    return count;
  };
  const addSpatialConfig = (spatial: Record<string, unknown>, stageId?: string, includeRoutePoints = true) => {
    let count = 0;
    count += add("bastionPositions", spatial.bastionPositions, stageId);
    if (includeRoutePoints) {
      count += add("resetPosition", spatial.resetPosition, stageId);
      count += add("endPosition", spatial.endPosition, stageId);
      count += add("thirdPersonPosition", spatial.thirdPersonPosition, stageId);
      count += add("creditsPosition", spatial.creditsPosition, stageId);
    }
    count += add("portalPositions", spatial.portalPositions, stageId);
    count += add("springboardPositions", spatial.springboardPositions, stageId);
    if (spatial.control && typeof spatial.control === "object") {
      const control = spatial.control as Record<string, unknown>;
      count += add("controlCenterPositions", control.centerPositions, stageId);
      count += add("controlJumpPositions", control.jumpPositions, stageId);
      count += add("controlRespawnPositions", control.respawnPositions, stageId);
    }
    return count;
  };
  if (Array.isArray(config.stages)) {
    const hasRoutePoints = "endPosition" in config;
    if (hasRoutePoints) totalPositions += addSpatialConfig(config);
    for (const stage of config.stages) {
      if (!stage || typeof stage !== "object") continue;
      const value = stage as Record<string, unknown>;
      const stageId = typeof value.stageId === "string" ? value.stageId : undefined;
      totalPositions += addSpatialConfig(value, stageId, true);
      const detection = value.setupDetection;
      if (detection && typeof detection === "object") totalPositions += add("setupDetection", (detection as Record<string, unknown>).position, stageId);
    }
  } else {
    totalPositions = addSpatialConfig(config);
  }
  return { totalPositions, fields };
}

type SpatialFields = ReturnType<typeof collectSpatialFields>;

function collectSpatialFields(source: string) {
  return {
    bastionPositions: collectVectors(source, "bastionPosition"),
    controlCenterPositions: collectVectors(source, "controlCenterPosition"),
    controlJumpPositions: collectVectors(source, "controlJumpPosition"),
    controlRespawnPositions: collectVectors(source, "controlRespawnPosition"),
    portalPositions: collectVectors(source, "portalPosition"),
    springboardPositions: collectVectors(source, "springBoardPosition"),
    resetPosition: collectScalarVector(source, "resetPosition"),
    endPosition: collectScalarVector(source, "endPosition"),
    thirdPersonPosition: scalarAliases.map((field) => collectScalarVector(source, field)).find(isVector),
    creditsPosition: collectScalarVector(source, "creditsPosition"),
    respawnAxis: collectAxis(source),
    respawnAxisThreshold: collectThreshold(source),
  };
}

const importedConfig = (config: SpatialConfigValue): SpatialConfigImportResult => ({ ok: true, config, summary: summaryFor(config) });
const invalidImport = (error: string): SpatialConfigImportResult => ({ ok: false, error });

function parseCompositeRoute(fields: SpatialFields): SpatialConfigImportResult {
  const { bastionPositions, controlCenterPositions, controlJumpPositions, controlRespawnPositions, portalPositions, springboardPositions, resetPosition, endPosition, thirdPersonPosition, creditsPosition, respawnAxis, respawnAxisThreshold } = fields;
  if (bastionPositions.length || controlCenterPositions.length || controlJumpPositions.length || controlRespawnPositions.length || portalPositions.length || springboardPositions.length) {
    return invalidImport("此处只接受全路线点位；出生点、控制点、阶段跳点和重生室请粘贴到对应阶段。");
  }
  if (!resetPosition || !endPosition || !thirdPersonPosition || !creditsPosition) {
    return invalidImport("全路线点位需要包含重置点、终点、第三人称点（或 heroRingPosition）和结算点。");
  }
  if ((respawnAxis === undefined) !== (respawnAxisThreshold === undefined)) {
    return invalidImport("重生轴和阈值必须同时提供，或同时留空。");
  }
  return importedConfig({
    resetPosition,
    endPosition,
    thirdPersonPosition,
    creditsPosition,
    control: respawnAxis === undefined ? null : { respawnAxis: respawnAxis ?? null, respawnAxisThreshold: respawnAxisThreshold ?? null },
  });
}

function parseCompositeStage(fields: SpatialFields): SpatialConfigImportResult {
  const { bastionPositions, controlCenterPositions, controlJumpPositions, controlRespawnPositions, portalPositions, springboardPositions, resetPosition, endPosition, thirdPersonPosition, creditsPosition, respawnAxis, respawnAxisThreshold } = fields;
  if (respawnAxis !== undefined || respawnAxisThreshold !== undefined) return invalidImport("重生轴仅配置在全路线点位中。");
  if (bastionPositions.length === 0) return invalidImport("此阶段至少需要一个 Bastion 出生点。");
  const hasControl = controlCenterPositions.length > 0 || controlJumpPositions.length > 0 || controlRespawnPositions.length > 0;
  return importedConfig({
    bastionPositions,
    ...(resetPosition ? { resetPosition } : {}),
    ...(thirdPersonPosition ? { thirdPersonPosition } : {}),
    ...(creditsPosition ? { creditsPosition } : {}),
    ...(endPosition ? { endPosition } : {}),
    control: hasControl ? { centerPositions: controlCenterPositions, jumpPositions: controlJumpPositions, respawnPositions: controlRespawnPositions } : null,
    portalPositions,
    springboardPositions,
  });
}

function parseSingleConfig(fields: SpatialFields, existingConfig: SpatialConfigValue | null): SpatialConfigImportResult {
  const { bastionPositions, controlCenterPositions, controlJumpPositions, controlRespawnPositions, portalPositions, springboardPositions, resetPosition, endPosition, thirdPersonPosition, creditsPosition, respawnAxis, respawnAxisThreshold } = fields;
  const missing = [
    bastionPositions.length === 0 ? "Bastion 出生点" : null,
    !resetPosition ? "重置点" : null,
    !endPosition ? "终点" : null,
    !thirdPersonPosition ? "第三人称点（或 heroRingPosition）" : null,
    !creditsPosition ? "结算点" : null,
  ].filter((value): value is string => value !== null);
  if (missing.length) return invalidImport(`缺少必需点位：${missing.join("、")}。请粘贴同一张地图的完整定位代码。`);

  const hasControl = controlCenterPositions.length > 0 || controlJumpPositions.length > 0 || controlRespawnPositions.length > 0 || respawnAxis !== undefined || respawnAxisThreshold !== undefined;
  if (hasControl && ((respawnAxis === undefined) !== (respawnAxisThreshold === undefined))) return invalidImport("占领重生轴和阈值必须同时提供，或同时留空。");
  if (hasControl && respawnAxis !== null && respawnAxis !== undefined && controlRespawnPositions.length === 0) return invalidImport("配置了占领重生轴，但没有占领重生点。");

  return importedConfig({
    bastionPositions,
    resetPosition,
    endPosition,
    thirdPersonPosition,
    creditsPosition,
    control: hasControl ? { centerPositions: controlCenterPositions, jumpPositions: controlJumpPositions, respawnPositions: controlRespawnPositions, respawnAxis: respawnAxis ?? null, respawnAxisThreshold: respawnAxisThreshold ?? null } : null,
    portalPositions,
    springboardPositions,
    alternateStages: Array.isArray(existingConfig?.alternateStages) ? existingConfig.alternateStages : [],
  });
}

export function parseSpatialConfigSource(
  source: string,
  existingConfig: SpatialConfigValue | null = null,
  scope: SpatialConfigScope = "single",
): SpatialConfigImportResult {
  const trimmed = normalizeWorkshopAliases(source).trim();
  if (!trimmed) return invalidImport("请粘贴游戏内的点位代码。");
  if (trimmed.startsWith("{")) {
    if (scope !== "single") return invalidImport("此处只接受当前路线或阶段的 Raw Workshop 点位代码。");
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return invalidImport("空间配置必须是对象。");
      const config = parsed as SpatialConfigValue;
      if ("stages" in config || "composition" in config) {
        const validated = agentSpatialConfigSchema.safeParse(config);
        if (!validated.success || !("stages" in validated.data)) return invalidImport("组合路线 JSON 无效，请检查阶段 ID、选择数量和检测配置。");
      }
      return importedConfig(config);
    } catch {
      return invalidImport("无法解析内容，请粘贴游戏内 Vector 点位代码。");
    }
  }
  if (scope === "single" && Array.isArray(existingConfig?.stages)) return invalidImport("组合路线请使用平台空间 JSON 编辑原子阶段与选择约束。");

  const fields = collectSpatialFields(trimmed);
  const parseByScope = {
    "single": () => parseSingleConfig(fields, existingConfig),
    "composite-route": () => parseCompositeRoute(fields),
    "composite-stage": () => parseCompositeStage(fields),
  } satisfies Record<SpatialConfigScope, () => SpatialConfigImportResult>;
  return parseByScope[scope]();
}

const addWorkshopVector = (lines: string[], name: string, value: unknown) => {
  if (isVector(value)) lines.push(`Global.${name} = Vector(${value.join(", ")});`);
};

const addWorkshopVectorList = (lines: string[], name: string, value: unknown) => {
  if (!isVectorList(value)) return;
  for (const position of value) lines.push(`Modify Global Variable(${name}, Append To Array, Vector(${position.join(", ")}));`);
};

const addCommonWorkshopVectors = (lines: string[], config: SpatialConfigValue) => {
  addWorkshopVector(lines, "endPosition", config.endPosition);
  addWorkshopVector(lines, "heroRingPosition", config.thirdPersonPosition);
  addWorkshopVector(lines, "resetPosition", config.resetPosition);
  addWorkshopVector(lines, "creditsPosition", config.creditsPosition);
};

const addWorkshopControlVectors = (lines: string[], value: unknown, options: { positions?: boolean; respawnAxis?: boolean } = {}) => {
  if (!value || typeof value !== "object") return;
  const control = value as Record<string, unknown>;
  if (options.positions !== false) {
    addWorkshopVectorList(lines, "controlCenterPosition", control.centerPositions);
    addWorkshopVectorList(lines, "controlJumpPosition", control.jumpPositions);
    addWorkshopVectorList(lines, "controlRespawnPosition", control.respawnPositions);
  }
  if (options.respawnAxis !== false && (control.respawnAxis === "x" || control.respawnAxis === "y" || control.respawnAxis === "z")) {
    lines.push(`Global.controlRespawnAxis = ${["x", "y", "z"].indexOf(control.respawnAxis)};`);
  }
  if (options.respawnAxis !== false && typeof control.respawnAxisThreshold === "number") lines.push(`Global.controlRespawnAxisThreshold = ${control.respawnAxisThreshold};`);
};

const addWorkshopOptionalArrays = (lines: string[], config: SpatialConfigValue) => {
  addWorkshopVectorList(lines, "portalPosition", config.portalPositions);
  addWorkshopVectorList(lines, "springBoardPosition", config.springboardPositions);
};

export function formatWorkshopSpatialConfig(config: SpatialConfigValue | null, scope: SpatialConfigScope = "single"): string {
  if (!config) return "";
  if (scope === "single" && Array.isArray(config.stages)) return JSON.stringify(config, null, 2);
  if (scope === "composite-route") {
    if (!isVector(config.resetPosition) || !isVector(config.endPosition) || !isVector(config.thirdPersonPosition) || !isVector(config.creditsPosition)) return "";
    const lines: string[] = [];
    addCommonWorkshopVectors(lines, config);
    addWorkshopControlVectors(lines, config.control, { positions: false });
    return lines.join("\n");
  }
  const stageScope = scope === "composite-stage";
  if (!isVectorList(config.bastionPositions) || (!stageScope && (!isVector(config.resetPosition) || !isVector(config.endPosition) || !isVector(config.thirdPersonPosition) || !isVector(config.creditsPosition)))) return "";
  const lines = config.bastionPositions.map((position, index) => `Global.bastionPosition[${index}] = Vector(${position.join(", ")});`);
  addCommonWorkshopVectors(lines, config);
  addWorkshopControlVectors(lines, config.control, { respawnAxis: !stageScope });
  addWorkshopOptionalArrays(lines, config);
  return lines.join("\n");
}
