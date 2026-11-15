import { agentProjectedSpatialConfigSchema, agentSpatialConfigSchema, type AgentSpatialConfig } from "@owbastion/contracts";
import { compareText } from "./compare-text";

const normalizeSpatialConfig = <T extends AgentSpatialConfig>(config: T): T => "stages" in config
  ? { ...config, stages: [...config.stages].sort((left, right) => compareText(left.stageId, right.stageId)) } as T
  : { ...config, alternateStages: [...config.alternateStages].sort((left, right) => compareText(left.stageId, right.stageId)) } as T;

export const parseSpatialConfig = (value: unknown): AgentSpatialConfig => {
  const parsed = agentSpatialConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_SPATIAL_CONFIG");
  return normalizeSpatialConfig(parsed.data);
};

export const parseAgentSpatialConfig = (value: string | null) => {
  if (!value) return null;
  try {
    const parsed = agentProjectedSpatialConfigSchema.safeParse(JSON.parse(value));
    return parsed.success ? normalizeSpatialConfig(parsed.data) : null;
  } catch {
    return null;
  }
};
