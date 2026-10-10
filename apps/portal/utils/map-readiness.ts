import { agentSpatialConfigSchema } from "@owbastion/contracts";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";

const routePoints: Array<[string, string]> = [["resetPosition", "重置点"], ["endPosition", "终点"], ["thirdPersonPosition", "第三人称点"], ["creditsPosition", "结算点"]];

// Plain-language reasons a spatial config cannot be saved yet, in the order a maintainer would fix them.
export function spatialProblems(config: SpatialConfigValue | null): string[] {
  if (!config) return ["还没有粘贴点位"];
  if (agentSpatialConfigSchema.safeParse(config).success) return [];
  if (Array.isArray(config.stages)) return ["多合一路线不完整：请检查各阶段点位和抽取规则"];
  const problems: string[] = [];
  if (!Array.isArray(config.bastionPositions) || config.bastionPositions.length === 0) problems.push("缺少 Bastion 出生点");
  for (const [field, label] of routePoints) if (!config[field]) problems.push(`缺少${label}`);
  return problems.length ? problems : ["点位代码无效，请重新从游戏内复制"];
}
