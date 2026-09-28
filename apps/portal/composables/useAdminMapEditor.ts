import type {
  AdminMapEditorAudit as ContractAdminMapEditorAudit,
  AdminMapEditorChallengeOption as ContractAdminMapEditorChallengeOption,
  AdminMapEditorResponse,
  AdminMapMetadataUpdateRequest,
  AdminMapRevision as ContractAdminMapRevision,
  AdminMapRevisionChallengeAssignment as ContractAdminMapRevisionChallengeAssignment,
  AdminMapRevisionCreateRequest,
  AdminMapRevisionPromotionRequest,
  AdminMapRevisionUpdateRequest,
} from "@owbastion/contracts";
import type { Map } from "~/types/challenge";
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";
import type { SpatialConfigValue } from "~/utils/spatial-config-import";

export type AdminMapRevisionLifecycle = ContractAdminMapRevision["lifecycle"];
export type AdminMapRevisionReplacementLifecycle = NonNullable<AdminMapRevisionPromotionRequest["replacedDefaultLifecycle"]>;
export type AdminMapRevisionChallengeFamily = ContractAdminMapRevisionChallengeAssignment["challengeFamily"];
export type AdminMapRevisionChallengeAssignment = ContractAdminMapRevisionChallengeAssignment;
export type AdminMapEditorRevision = Omit<ContractAdminMapRevision, "spatialConfig"> & { spatialConfig: SpatialConfigValue | null };
export type AdminMapEditorChallengeOption = ContractAdminMapEditorChallengeOption;
export type AdminMapEditorAudit = ContractAdminMapEditorAudit;
export type AdminMapEditor = Omit<AdminMapEditorResponse, "revisions" | "audit"> & { revisions: AdminMapEditorRevision[]; audit: AdminMapEditorAudit[] };
export type AdminMapRevisionAssignmentInput = Omit<AdminMapRevisionChallengeAssignment, "assignmentId" | "gameplayRevisionId" | "mapId">;
export type AdminMapRevisionUpdateInput = Omit<AdminMapRevisionUpdateRequest, "spatialConfig" | "challengeAssignments"> & { spatialConfig: SpatialConfigValue | null; challengeAssignments: AdminMapRevisionAssignmentInput[] };

export function useAdminMapEditor(mapId: string) {
  const api = useAdminApi();
  const editor = shallowRef<AdminMapEditor | null>(null);
  const saving = shallowRef(false);
  const error = shallowRef("");

  const adminData = useAdminAsyncData("map-editor", () => api<AdminMapEditor>(`/v1/maps/${encodeURIComponent(mapId)}/editor`), {
    cacheKey: mapId,
    onStart: () => { error.value = ""; },
    onData: (response) => { editor.value = response; },
    onError: (cause) => { error.value = portalErrorDetails(cause, "无法读取地图版本修订编辑器，请稍后重试。").description; },
  });
  const loading = adminData.loading;
  const load = async () => { error.value = ""; await adminData.refresh(); };

  const saveMetadata = async (input: Omit<AdminMapMetadataUpdateRequest, "contractVersion">) => {
    saving.value = true;
    try {
      const map = await api<Map>(`/v1/maps/${encodeURIComponent(mapId)}/metadata`, {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", ...input },
      });
      await load();
      return map;
    } finally {
      saving.value = false;
    }
  };

  const saveRevision = async (revisionId: string, input: AdminMapRevisionUpdateInput) => {
    saving.value = true;
    try {
      const revision = await api<AdminMapEditorRevision>(`/v1/maps/${encodeURIComponent(mapId)}/revisions/${encodeURIComponent(revisionId)}`, {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: input,
      });
      await load();
      return revision;
    } finally {
      saving.value = false;
    }
  };

  const promoteRevision = async (revisionId: string, replacedDefaultLifecycle: AdminMapRevisionReplacementLifecycle | null) => {
    saving.value = true;
    try {
      const revision = await api<AdminMapEditorRevision>(`/v1/maps/${encodeURIComponent(mapId)}/revisions/${encodeURIComponent(revisionId)}/promote`, {
        method: "POST",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", replacedDefaultLifecycle },
      });
      await load();
      return revision;
    } finally {
      saving.value = false;
    }
  };

  const createRevision = async (input: Omit<AdminMapRevisionCreateRequest, "contractVersion" | "spatialConfig" | "challengeAssignments">) => {
    saving.value = true;
    try {
      const revision = await api<AdminMapEditorRevision>(`/v1/maps/${encodeURIComponent(mapId)}/revisions`, {
        method: "POST",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", ...input },
      });
      await load();
      return revision;
    } finally {
      saving.value = false;
    }
  };

  return { editor, loading, saving, error, load, saveMetadata, saveRevision, promoteRevision, createRevision };
}
