import { z } from "zod";

export const contractVersion = z.literal("1");

const externalId = z.string().trim().min(1).max(256);
const playerId = z.string().regex(/^\d{1,10}$/);

export const qqBindingRequestSchema = z.object({
  contractVersion,
  provider: z.literal("qq"),
  groupOpenId: externalId,
  memberOpenId: externalId,
  playerName: z.string().trim().min(1).max(64),
  playerId,
});

export const qqBindingResponseSchema = z.object({
  contractVersion,
  bindingId: z.string().uuid(),
  identityId: z.string().uuid(),
  provider: z.literal("qq"),
  groupOpenId: externalId,
  memberOpenId: externalId,
  playerName: z.string().trim().min(1).max(64),
  playerId,
});

export const qqLoginAttemptRequestSchema = z.object({ contractVersion, provider: z.literal("qq") });
export const qqLoginAttemptResponseSchema = z.object({
  contractVersion,
  attemptId: z.string().uuid(),
  attemptToken: z.string().min(32),
  code: z.string().regex(/^[A-Z2-9]{6}$/),
  expiresAt: z.number().int(),
});
export const qqLoginStatusResponseSchema = z.object({
  contractVersion,
  status: z.enum(["pending", "verified", "expired"]),
  environment: z.enum(["production", "test"]).optional(),
  sessionToken: z.string().min(32).optional(),
});
export const qqLoginVerifyRequestSchema = z.object({
  contractVersion,
  provider: z.literal("qq"),
  code: z.string().regex(/^[A-Z2-9]{6}$/),
  groupOpenId: externalId,
  memberOpenId: externalId,
  messageId: externalId,
});
export const qqLoginVerifyResponseSchema = z.object({
  contractVersion,
  status: z.literal("verified"),
  environment: z.enum(["production", "test"]),
});
export const qqGroupAccessRequestSchema = z.object({ contractVersion, groupOpenId: externalId, environment: z.enum(["production", "test"]), enabled: z.boolean() });

const attachmentSchema = z.object({
  externalAttachmentId: externalId,
  contentType: z.string().trim().min(1).max(128),
  byteSize: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sourceUrl: z.string().url().max(4096),
});

export const submissionRequestSchema = z.object({
  contractVersion,
  actor: z.object({
    provider: z.literal("qq"),
    groupOpenId: externalId,
    memberOpenId: externalId,
  }),
  source: z.object({
    provider: z.literal("qq"),
    conversationId: externalId,
    messageId: externalId,
  }),
  challenge: z.object({
    type: z.literal("map_completion"),
    mapName: z.string().trim().min(1).max(256),
  }),
  attachments: z.array(attachmentSchema).min(1).max(20),
});

export const submissionResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  status: z.enum(["evidence_pending", "evidence_stored", "ocr_pending", "resubmission_required"]),
  mapName: z.string(),
  attachmentIds: z.array(z.string().uuid()),
});

export const submissionStatusResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  status: z.enum(["received", "evidence_pending", "evidence_stored", "ocr_pending", "resubmission_required"]),
  mapName: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const currentPlayerResponseSchema = z.object({
  contractVersion,
  player: z.object({
    playerId,
    playerName: z.string().trim().min(1).max(64),
    bindingStatus: z.literal("bound"),
  }),
  recentSubmissions: z.array(submissionStatusResponseSchema.omit({ contractVersion: true })).max(5),
});

export const errorResponseSchema = z.object({
  contractVersion,
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export type QqBindingRequest = z.infer<typeof qqBindingRequestSchema>;
export type QqBindingResponse = z.infer<typeof qqBindingResponseSchema>;
export type QqLoginAttemptRequest = z.infer<typeof qqLoginAttemptRequestSchema>;
export type QqLoginAttemptResponse = z.infer<typeof qqLoginAttemptResponseSchema>;
export type QqLoginStatusResponse = z.infer<typeof qqLoginStatusResponseSchema>;
export type QqLoginVerifyRequest = z.infer<typeof qqLoginVerifyRequestSchema>;
export type QqLoginVerifyResponse = z.infer<typeof qqLoginVerifyResponseSchema>;
export type QqGroupAccessRequest = z.infer<typeof qqGroupAccessRequestSchema>;
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;
export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;
export type SubmissionStatusResponse = z.infer<typeof submissionStatusResponseSchema>;
export type CurrentPlayerResponse = z.infer<typeof currentPlayerResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
