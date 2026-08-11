import type { Map } from "./useSubmissionUpload";
import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";

export type AdminMapRevisionLifecycle = "preparing" | "default" | "selectable" | "historical";
export type AdminMapRevisionChallengeFamily = "map_challenge" | "map_title_rule" | "title_challenge";
export type AdminMapRevisionChallengeAssignment = {
  assignmentId: string;
  gameplayRevisionId: string;
  mapId: string;
  challengeFamily: AdminMapRevisionChallengeFamily;
  challengeId: string;
  enabled: boolean;
  condition: string | null;
  evidenceRule: string | null;
  submissionMode: "manual" | "automatic" | null;
  slot: "pioneer" | "conqueror" | "dominator" | null;
};
export type AdminMapEditorRevision = {
  revisionId: string;
  mapId: string;
  lifecycle: AdminMapRevisionLifecycle;
  mapVariant: "classic" | null;
  copiedFromRevisionId: string | null;
  resetReason: string | null;
  gameVersion: string;
  spatialConfig: Record<string, unknown> | null;
  isDefault: boolean;
  isSelectable: boolean;
  challengeAssignments: AdminMapRevisionChallengeAssignment[];
  createdAt: number;
  updatedAt: number;
};
export type AdminMapEditorChallengeOption = {
  challengeFamily: AdminMapRevisionChallengeFamily;
  challengeId: string;
  label: string;
  kind: string;
  status: string;
  gameVersion: string;
};
export type AdminMapEditorAudit = {
  operation: string;
  actorType: string;
  actorId: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: number;
};
export type AdminMapEditor = {
  contractVersion: "1";
  map: Map;
  revisions: AdminMapEditorRevision[];
  challengeCatalog: AdminMapEditorChallengeOption[];
  audit: AdminMapEditorAudit[];
};
export type AdminMapRevisionAssignmentInput = Omit<AdminMapRevisionChallengeAssignment, "assignmentId" | "gameplayRevisionId" | "mapId">;
export type AdminMapRevisionUpdateInput = {
  contractVersion: "1";
  lifecycle: AdminMapRevisionLifecycle;
  gameVersion: string;
  mapVariant: "classic" | null;
  spatialConfig: Record<string, unknown> | null;
  challengeAssignments: AdminMapRevisionAssignmentInput[];
};

export function useAdminMapEditor(mapId: string) {
  const api = useAdminApi();
  const editor = shallowRef<AdminMapEditor | null>(null);
  const loading = shallowRef(false);
  const saving = shallowRef(false);
  const error = shallowRef("");

  const load = async () => {
    loading.value = true;
    error.value = "";
    try {
      editor.value = await api<AdminMapEditor>(`/v1/maps/${encodeURIComponent(mapId)}/editor`);
    } catch (cause) {
      error.value = portalErrorDetails(cause, "无法读取地图版本修订编辑器，请稍后重试。").description;
      throw cause;
    } finally {
      loading.value = false;
    }
  };

  const saveMetadata = async (input: { difficultyRating: Map["difficultyRating"]; mechanics: string[]; coverUrl: string | null; backgroundUrl: string | null }) => {
    saving.value = true;
    try {
      const map = await api<Map>(`/v1/maps/${encodeURIComponent(mapId)}/metadata`, {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", ...input },
      });
      if (editor.value) editor.value = { ...editor.value, map };
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
      if (editor.value) editor.value = { ...editor.value, revisions: editor.value.revisions.map((item) => item.revisionId === revision.revisionId ? revision : item) };
      return revision;
    } finally {
      saving.value = false;
    }
  };

  const createRevision = async (input: {
    sourceRevisionId: string | null;
    resetReason: string;
    gameVersion: string;
    mapVariant: "classic" | null;
    copyConfiguration: boolean;
  }) => {
    saving.value = true;
    try {
      const revision = await api<AdminMapEditorRevision>(`/v1/maps/${encodeURIComponent(mapId)}/revisions`, {
        method: "POST",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", ...input },
      });
      if (editor.value) editor.value = { ...editor.value, revisions: [...editor.value.revisions, revision] };
      return revision;
    } finally {
      saving.value = false;
    }
  };

  return { editor, loading, saving, error, load, saveMetadata, saveRevision, createRevision };
}
