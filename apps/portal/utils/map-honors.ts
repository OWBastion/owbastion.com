import type {
  AdminMapEditorChallengeOption,
  AdminMapRevisionAssignmentInput,
  AdminMapRevisionChallengeFamily,
} from "~/composables/useAdminMapEditor";

export type MapAssignments = Record<string, AdminMapRevisionAssignmentInput>;
export type MapHonorKind = "conqueror" | "dominator" | "pioneer" | "classic" | "other";
export type MapHonor = {
  key: string;
  name: string;
  kind: MapHonorKind;
  items: AdminMapEditorChallengeOption[];
};

export const assignmentKey = (family: AdminMapRevisionChallengeFamily, challengeId: string) => `${family}:${challengeId}`;
export const optionKey = (option: AdminMapEditorChallengeOption) => assignmentKey(option.challengeFamily, option.challengeId);

const familyOrder: Record<AdminMapRevisionChallengeFamily, number> = { map_title_rule: 0, map_challenge: 1, title_challenge: 2 };

function honorKind(items: AdminMapEditorChallengeOption[]): MapHonorKind {
  for (const item of items) {
    const kind = item.kind.trim().toLowerCase();
    if (kind === "conqueror" || kind === "dominator" || kind === "pioneer" || kind === "classic") return kind;
    if (kind === "classic_completion") return "classic";
  }
  return "other";
}

// A title and the challenges that reward it share a titleKey, so they read as one honor.
export function groupHonors(catalog: AdminMapEditorChallengeOption[]): MapHonor[] {
  const groups = new globalThis.Map<string, AdminMapEditorChallengeOption[]>();
  for (const option of catalog) {
    const key = option.titleKey ? `title:${option.titleKey}` : optionKey(option);
    groups.set(key, [...(groups.get(key) ?? []), option]);
  }
  return [...groups.entries()].map(([key, items]) => {
    const sorted = [...items].sort((left, right) => familyOrder[left.challengeFamily] - familyOrder[right.challengeFamily]);
    return { key, name: sorted[0]!.label, kind: honorKind(sorted), items: sorted };
  });
}

export const enabledCount = (honor: MapHonor, assignments: MapAssignments) =>
  honor.items.filter((option) => assignments[optionKey(option)]?.enabled === true).length;

export function setHonorEnabled(assignments: MapAssignments, honor: MapHonor, enabled: boolean): MapAssignments {
  return setOptionsEnabled(assignments, honor.items, enabled);
}

export function setOptionsEnabled(assignments: MapAssignments, options: AdminMapEditorChallengeOption[], enabled: boolean): MapAssignments {
  const next = { ...assignments };
  for (const option of options) {
    const key = optionKey(option);
    const existing = next[key];
    if (existing) next[key] = { ...existing, enabled };
    else if (enabled) next[key] = { challengeFamily: option.challengeFamily, challengeId: option.challengeId, enabled: true, condition: null, evidenceRule: null, submissionMode: null, slot: null };
  }
  return next;
}

// Classic revisions carry the veteran honor only; every other revision carries the rest.
export function recommendedAssignments(assignments: MapAssignments, honors: MapHonor[], mapVariant: "classic" | null): MapAssignments {
  let next = assignments;
  for (const honor of honors) next = setHonorEnabled(next, honor, mapVariant === "classic" ? honor.kind === "classic" : honor.kind !== "classic");
  return next;
}
