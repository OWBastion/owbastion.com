import { z } from "zod";

export const contractVersion = z.literal("1");

const externalId = z.string().trim().min(1).max(256);

export const qqBindingRequestSchema = z.object({
  contractVersion,
  provider: z.literal("qq"),
  externalUserId: externalId,
});

export const qqBindingResponseSchema = z.object({
  contractVersion,
  bindingId: z.string().uuid(),
  identityId: z.string().uuid(),
  provider: z.literal("qq"),
  externalUserId: externalId,
});

const attachmentSchema = z.object({
  externalAttachmentId: externalId,
  contentType: z.string().trim().min(1).max(128),
  byteSize: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export const submissionRequestSchema = z.object({
  contractVersion,
  bindingId: z.string().uuid(),
  source: z.object({
    provider: z.literal("qq"),
    conversationId: externalId,
    messageId: externalId,
  }),
  attachments: z.array(attachmentSchema).min(1).max(20),
});

export const submissionResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  bindingId: z.string().uuid(),
  status: z.literal("received"),
  attachmentIds: z.array(z.string().uuid()),
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
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;
export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
