import { readonly, shallowRef } from "vue";
import { portalErrorDetails } from "~/utils/portal-error";

export type ReleaseOverview = {
  contractVersion: "1";
  current: { releaseId: string; candidateId: string; sourceVersion: string; bastionCommitSha: string | null; activatedAt: number | null } | null;
  next: { candidateId: string; sourceVersion: string; snapshotHash: string; status: "candidate" | "queued" | "running" | "succeeded" | "failed" } | null;
  drafts: ReadonlyArray<{ draftId: string; name: string; status: string; updatedAt: number }>;
  releases: ReadonlyArray<{ releaseId: string; candidateId: string; sourceVersion: string; status: string; bastionCommitSha: string | null; activatedAt: number | null; createdAt: number }>;
};

export type ReleaseDiff = {
  contentType: "event" | "map" | "title" | "challenge";
  contentId: string;
  change: "added" | "modified" | "removed";
  beforeOperation: "upsert" | "retire" | "delete" | null;
  afterOperation: "upsert" | "retire" | "delete" | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
export type ReleaseDraftDetail = { contractVersion: "1"; draftId: string; name: string; status: "open"; createdAt: number; updatedAt: number; items: readonly { contentType: ReleaseDiff["contentType"]; contentId: string; operation: "upsert" | "retire" | "delete"; data: Record<string, unknown> }[]; diff: readonly ReleaseDiff[] };

export function useReleasePlane() {
  const api = useAdminApi();
  const overview = shallowRef<ReleaseOverview | null>(null);
  const loading = shallowRef(false);
  const error = shallowRef("");

  const refresh = async () => {
    loading.value = true;
    error.value = "";
    try { overview.value = await api<ReleaseOverview>("/v1/releases/overview"); }
    catch (cause) { error.value = portalErrorDetails(cause, "无法读取发布状态。").description; }
    finally { loading.value = false; }
  };

  const createDraft = (name: string) => api<{ draftId: string }>("/v1/releases/drafts", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", name } });
  const createDraftFromCatalog = (name: string) => api<{ contractVersion: "1"; draftId: string; name: string; status: "open"; createdAt: number; updatedAt: number }>("/v1/releases/drafts/from-catalog", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", name } });
  const getDraft = (draftId: string) => api<ReleaseDraftDetail>(`/v1/releases/drafts/${encodeURIComponent(draftId)}`);
  const putDraftItem = (draftId: string, item: { contentType: string; contentId: string; operation: string; data: Record<string, unknown> }) => api<{ itemId: string }>(`/v1/releases/drafts/${encodeURIComponent(draftId)}/items`, { method: "PUT", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", ...item } });
  const createChangeSet = (draftId: string, name: string, itemIds: string[]) => api<{ changeSetId: string }>("/v1/releases/change-sets", { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", draftId, name, itemIds } });
  const createChangeSetFromDraft = (draftId: string, name: string) => api<{ changeSetId: string }>(`/v1/releases/drafts/${encodeURIComponent(draftId)}/change-set`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1", name } });
  const createCandidate = (changeSetId: string) => api<{ candidateId: string }>(`/v1/releases/change-sets/${encodeURIComponent(changeSetId)}/candidate`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1" } });
  const startBuild = (candidateId: string) => api<{ buildId: string }>(`/v1/releases/candidates/${encodeURIComponent(candidateId)}/build`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: { contractVersion: "1" } });

  return { overview: readonly(overview), loading: readonly(loading), error: readonly(error), refresh, createDraft, createDraftFromCatalog, getDraft, putDraftItem, createChangeSet, createChangeSetFromDraft, createCandidate, startBuild };
}
