import type {
  AdminAnnotationProposal,
  AdminBindingClaim,
  AdminBindingInvitation,
  AdminDatasetSnapshot,
  AdminMasteryRun,
  AdminSubmission,
} from "~/composables/useAdminApi";
import { submissionStatusText } from "~/utils/submissionStatus";
import { annotationFieldLabel } from "~/utils/annotation-labels";
import { portalErrorDetails } from "~/utils/portal-error";

export type AdminPendingWorkItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
};

export type AdminPendingWorkGroup = {
  id: string;
  label: string;
  href: string;
  count: number | null;
  items: readonly AdminPendingWorkItem[];
  error: string | null;
};

type PageResult<T> = { items: T[]; total: number };
type ReadResult<T> = { value: T; error: null } | { value: null; error: string };

const pageSize = 5;
const claimOperationLabel = (claim: AdminBindingClaim) => ({
  conflict: "身份冲突",
  rebind_account: "账号换绑",
  qq_transfer: "QQ 身份迁移",
  initial_binding: "首次绑定例外",
}[claim.operationType ?? "initial_binding"]);
const annotationPriorityLabel = (proposal: AdminAnnotationProposal) => ({
  correction: "玩家修正",
  calibration_failure: "校准失败",
  uncertain: "识别不确定",
  repeat: "重复问题",
  confirmation: "例行确认",
}[proposal.priority.category]);
const submissionTitle = (submission: AdminSubmission) => submission.challenge?.family === "achievement"
  ? submission.challenge.titleName
  : submission.challenge?.family === "map"
    ? submission.challenge.name
    : submission.mapName;

export function useAdminInbox() {
  const api = useAdminApi();
  const groups = shallowRef<readonly AdminPendingWorkGroup[]>([]);
  const loading = shallowRef(true);

  async function read<T>(path: string, fallback: string): Promise<ReadResult<T>> {
    try {
      return { value: await api<T>(path), error: null };
    } catch (error) {
      return { value: null, error: portalErrorDetails(error, fallback).description };
    }
  }

  async function load() {
    loading.value = true;
    const [submissions, claims, invitations, masteryRuns, annotations, datasets] = await Promise.all([
      read<PageResult<AdminSubmission>>("/v1/submissions?status=ready_for_review,ocr_review_required&page=1&pageSize=5", "无法读取截图审核队列。"),
      read<{ items: AdminBindingClaim[] }>("/v1/binding-claims", "无法读取绑定例外。"),
      read<{ items: AdminBindingInvitation[] }>("/v1/binding-invites", "无法读取绑定邀请。"),
      read<PageResult<AdminMasteryRun>>("/v1/mastery-runs?unresolvedConflictsOnly=true&page=1&pageSize=5", "无法读取通关冲突。"),
      read<PageResult<AdminAnnotationProposal>>("/v1/annotations/proposals?state=pending&page=1&pageSize=5", "无法读取待审标注。"),
      read<PageResult<AdminDatasetSnapshot>>("/v1/datasets?status=draft&page=1&pageSize=5", "无法读取数据集草稿。"),
    ]);

    const bindingItems = [
      ...(claims.value?.items ?? [])
        .filter((claim) => claim.status === "pending_review")
        .map((claim) => ({
          sortAt: claim.createdAt,
          item: {
            id: `claim:${claim.claimId}`,
            title: `${claim.playerName}#${claim.playerId}`,
            detail: `${claimOperationLabel(claim)} · 需要处理`,
            href: "/admin/bindings",
          },
        })),
      ...(invitations.value?.items ?? [])
        .filter((invite) => invite.historicalMigration.status === "retry_required")
        .map((invite) => ({
          sortAt: invite.createdAt,
          item: {
            id: `migration:${invite.inviteId}`,
            title: `${invite.playerName}#${invite.playerId} · 历史称号迁移`,
            detail: "迁移需要重试",
            href: "/admin/bindings",
          },
        })),
    ].sort((a, b) => b.sortAt - a.sortAt);

    const bindingErrors = [claims.error, invitations.error].filter((error): error is string => error !== null);
    const submissionItems = submissions.value?.items.map((submission) => ({
      id: submission.submissionId,
      title: submissionTitle(submission),
      detail: `${submission.playerName} · ${submissionStatusText[submission.status] ?? submission.status}`,
      href: `/admin/reviews/${encodeURIComponent(submission.submissionId)}`,
    })) ?? [];

    groups.value = [
      {
        id: "submissions",
        label: "截图审核",
        href: "/admin/reviews",
        count: submissions.value?.total ?? null,
        items: submissionItems,
        error: submissions.error,
      },
      {
        id: "bindings",
        label: "绑定例外",
        href: "/admin/bindings",
        count: bindingErrors.length ? null : bindingItems.length,
        items: bindingItems.slice(0, pageSize).map(({ item }) => item),
        error: bindingErrors.length ? bindingErrors.join(" ") : null,
      },
      {
        id: "mastery",
        label: "通关冲突",
        href: "/admin/mastery-runs?unresolvedConflictsOnly=true",
        count: masteryRuns.value?.total ?? null,
        items: masteryRuns.value?.items.map((run) => ({
          id: run.runId,
          title: `${run.mapName} · ${run.difficulty}`,
          detail: `${run.playerName} · ${run.runCode}`,
          href: "/admin/mastery-runs?unresolvedConflictsOnly=true",
        })) ?? [],
        error: masteryRuns.error,
      },
      {
        id: "annotations",
        label: "OCR 标注",
        href: "/admin/annotations",
        count: annotations.value?.total ?? null,
        items: annotations.value?.items.map((proposal) => ({
          id: proposal.proposalId,
          title: `${proposal.submissionMapName} · ${annotationFieldLabel(proposal.fieldKey)}`,
          detail: annotationPriorityLabel(proposal),
          href: "/admin/annotations",
        })) ?? [],
        error: annotations.error,
      },
      {
        id: "datasets",
        label: "数据集草稿",
        href: "/admin/datasets",
        count: datasets.value?.total ?? null,
        items: datasets.value?.items.map((snapshot) => ({
          id: snapshot.datasetId,
          title: `快照 v${snapshot.version}`,
          detail: `${snapshot.counts.eligibleCount} 条入选 · 等待定稿`,
          href: "/admin/datasets",
        })) ?? [],
        error: datasets.error,
      },
    ];
    loading.value = false;
  }

  return { groups: readonly(groups), loading: readonly(loading), load };
}
