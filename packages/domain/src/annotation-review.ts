// Maintainer annotation review priority.
//
// The review queue is an operational aid, not ground truth: priority ranks
// proposals so maintainers spend time on the most useful samples first, and
// exposes a concise, explainable reason/category. It never automatically
// accepts or rejects an annotation and never becomes a Submission risk score.

export const annotationFieldKeys = ["map_name", "difficulty", "viewer_player", "challenge_completed", "achievement_titles"] as const;
export type AnnotationFieldKey = (typeof annotationFieldKeys)[number];

export const annotationPriorityCategories = ["correction", "calibration_failure", "uncertain", "repeat", "confirmation"] as const;
export type AnnotationPriorityCategory = (typeof annotationPriorityCategories)[number];

export const annotationCriticalFieldKeys = ["map_name", "difficulty", "viewer_player", "challenge_completed"] as const;

export type AnnotationProposalPriorityInput = {
  feedbackType: "confirmed" | "corrected" | "passive_report";
  promptOrigin: string | null;
  fieldKey: string;
  originalValue?: string | null;
  proposedValue?: string | null;
  // Number of other submitted proposals sharing the same field + proposed
  // value (excluding this one), signalling a possible systematic error.
  repeatCount?: number;
};

export type AnnotationProposalPriority = {
  score: number;
  category: AnnotationPriorityCategory;
  reasons: string[];
};

export const annotationProposalPriority = (input: AnnotationProposalPriorityInput): AnnotationProposalPriority => {
  let score = 0;
  const reasons: string[] = [];
  const critical = (annotationCriticalFieldKeys as readonly string[]).includes(input.fieldKey);
  const isCorrection = input.feedbackType === "corrected" || input.feedbackType === "passive_report";
  const changedValue = Boolean(input.proposedValue) && input.proposedValue !== input.originalValue;
  const calibrationFailure = input.promptOrigin === "calibration" && isCorrection && changedValue;
  const uncertainPrompt = input.promptOrigin === "uncertainty" || input.promptOrigin === "conflict" || input.promptOrigin === "grouped";
  const repeatCount = input.repeatCount ?? 0;

  if (calibrationFailure) {
    score += 40;
    reasons.push("calibration_failure");
  }
  if (isCorrection && changedValue) {
    score += 20;
    reasons.push("correction");
  } else if (uncertainPrompt && isCorrection) {
    score += 15;
    reasons.push("uncertain");
  }
  if (critical) {
    score += 5;
  }
  if (repeatCount > 0) {
    score += 10;
    reasons.push("repeat");
  }
  if (reasons.length === 0) reasons.push("confirmation");

  return { score, category: reasons[0] as AnnotationPriorityCategory, reasons };
};

export const isAnnotationFieldKey = (value: string): value is AnnotationFieldKey =>
  (annotationFieldKeys as readonly string[]).includes(value);
