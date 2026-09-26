import { installApiTestFetch } from "~/tests/utils/api-test-fetch";
import { mockNuxtImport } from "@nuxt/test-utils/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSubmissionUpload } from "~/composables/useSubmissionUpload";

const api = vi.fn();
const putEvidence = vi.fn();
installApiTestFetch({ portal: api, other: (url, options) => putEvidence(url, options) });

const file = () => new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
const session = (uploadId = "upload-1") => ({ uploadId, submissionId: "submission-1", expiresAt: Date.now() + 10 * 60_000 });
const failure = (statusCode?: number, code?: string) => Object.assign(new Error("failed"), { statusCode, ...(code ? { data: { error: { code } } } : {}) });
const calls = (suffix: string) => api.mock.calls.filter(([path]) => String(path).endsWith(suffix)).length;

beforeEach(() => {
  api.mockReset();
  putEvidence.mockReset();
});

describe("screenshot upload retry", () => {
  it("retries a failed upload on the same session without creating another submission", async () => {
    api.mockImplementation(async (path: string) => path.endsWith("/session") ? session() : { submissionId: "submission-1", status: "ocr_pending" });
    putEvidence.mockRejectedValueOnce(failure(503)).mockRejectedValueOnce(failure(503)).mockResolvedValue(undefined);
    const { submit, error } = useSubmissionUpload();

    await expect(submit(file())).rejects.toThrow();
    expect(error.value).toContain("无需重新选择截图");
    await expect(submit(file())).resolves.toEqual({ submissionId: "submission-1", status: "ocr_pending" });

    expect(calls("/session")).toBe(1);
    expect(putEvidence).toHaveBeenCalledTimes(3);
  });

  it("resumes at completion without uploading the screenshot again", async () => {
    let completions = 0;
    api.mockImplementation(async (path: string) => {
      if (path.endsWith("/session")) return session();
      if (++completions === 1) throw failure(503);
      return { submissionId: "submission-1", status: "ocr_pending" };
    });
    putEvidence.mockResolvedValue(undefined);
    const { submit, error } = useSubmissionUpload();

    await expect(submit(file())).rejects.toThrow();
    expect(error.value).toContain("不会重复上传");
    await expect(submit(file())).resolves.toMatchObject({ status: "ocr_pending" });

    expect(calls("/session")).toBe(1);
    expect(putEvidence).toHaveBeenCalledTimes(1);
  });

  it("retries a transient upload failure once and treats a rejected replay as already uploaded", async () => {
    api.mockImplementation(async (path: string) => path.endsWith("/session") ? session() : { submissionId: "submission-1", status: "ocr_pending" });
    putEvidence.mockRejectedValueOnce(failure()).mockRejectedValueOnce(failure(422, "UPLOAD_SESSION_INVALID"));
    const { submit } = useSubmissionUpload();

    await expect(submit(file())).resolves.toMatchObject({ status: "ocr_pending" });
    expect(putEvidence).toHaveBeenCalledTimes(2);
    expect(calls("/complete")).toBe(1);
  });

  it("starts a new session when the server rejected the previous one", async () => {
    let sessions = 0;
    api.mockImplementation(async (path: string) => path.endsWith("/session") ? session(`upload-${++sessions}`) : { submissionId: "submission-1", status: "ocr_pending" });
    putEvidence.mockRejectedValueOnce(failure(422, "UPLOAD_HASH_MISMATCH")).mockResolvedValue(undefined);
    const { submit } = useSubmissionUpload();

    await expect(submit(file())).rejects.toThrow();
    await submit(file());

    expect(calls("/session")).toBe(2);
  });
});
