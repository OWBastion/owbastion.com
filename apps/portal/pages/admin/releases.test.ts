import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ReleasesAdminPage from "./releases.vue";

const adminApi = vi.fn(async (path: string) => {
  if (path === "/v1/releases/overview") return {
    contractVersion: "1" as const,
    current: { releaseId: "release-1", candidateId: "candidate-1", sourceVersion: "26.0713.1", bastionCommitSha: "abc123", activatedAt: 1 },
    next: { candidateId: "candidate-2", sourceVersion: "next", snapshotHash: "a".repeat(64), status: "queued" as const },
    drafts: [{ draftId: "draft-1", name: "七月调整", status: "open", updatedAt: 1 }],
    releases: [{ releaseId: "release-1", candidateId: "candidate-1", sourceVersion: "26.0713.1", status: "active", bastionCommitSha: "abc123", activatedAt: 1, createdAt: 1 }],
  };
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin releases page", () => {
  it("shows Current, Next, and the candidate workflow", async () => {
    const wrapper = await mountSuspended(ReleasesAdminPage);
    await flushPromises();
    expect(wrapper.text()).toContain("Current");
    expect(wrapper.text()).toContain("26.0713.1");
    expect(wrapper.text()).toContain("queued");
    expect(wrapper.text()).toContain("从工作目录生成下一次构建");
    expect(wrapper.find('input[aria-label="草稿名称"]').exists()).toBe(true);
    expect(wrapper.find('input[aria-label="Draft ID"]').exists()).toBe(false);
    expect(wrapper.find('textarea[aria-label="内容 JSON"]').exists()).toBe(false);
  });
});
