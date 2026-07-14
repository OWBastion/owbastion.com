import { describe, expect, it } from "vitest";
import { qqBindingRequestSchema, submissionRequestSchema } from "./index";

describe("v1 platform contracts", () => {
  it("accepts stable QQ binding metadata", () => {
    expect(qqBindingRequestSchema.safeParse({ contractVersion: "1", provider: "qq", externalUserId: "user-1" }).success).toBe(true);
  });

  it("rejects a submission without evidence metadata", () => {
    expect(submissionRequestSchema.safeParse({ contractVersion: "1", bindingId: "00000000-0000-0000-0000-000000000001", source: { provider: "qq", conversationId: "group-1", messageId: "message-1" }, attachments: [] }).success).toBe(false);
  });

  it("rejects an unversioned contract", () => {
    expect(qqBindingRequestSchema.safeParse({ contractVersion: "2", provider: "qq", externalUserId: "user-1" }).success).toBe(false);
  });
});
