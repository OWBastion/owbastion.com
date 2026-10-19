import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import SubmissionProgress from "./SubmissionProgress.vue";

const labels = async (status: string, resubmissionRequired = false) => {
  const wrapper = await mountSuspended(SubmissionProgress, { props: { status, resubmissionRequired } });
  return wrapper.findAll("[role=img]").map((step) => step.attributes("aria-label")!.split("：")[1]);
};

// The wording is free to change; only which stage is in which state is the contract.
describe("submission progress", () => {
  it("places the current and failed stage according to the submission status", async () => {
    const complete = (await labels("completed"))[0]!;
    const current = (await labels("processing"))[1]!;
    const upcoming = (await labels("processing"))[2]!;
    const failed = (await labels("rejected"))[2]!;
    const stateKinds = new Set([complete, current, upcoming, failed]);
    expect(stateKinds.size).toBe(4);

    expect(await labels("completed")).toEqual([complete, complete, complete, complete]);
    expect(await labels("processing")).toEqual([complete, current, upcoming, upcoming]);
    expect(await labels("needs_review")).toEqual([complete, complete, current, upcoming]);
    expect(await labels("rejected")).toEqual([complete, complete, failed, upcoming]);
  });

  it("marks recognition as the failed stage when the screenshot must be resubmitted", async () => {
    const [, failedStage, ...rest] = await labels("rejected", true);
    const ordinaryRejection = await labels("rejected");
    expect(failedStage).not.toBe(ordinaryRejection[1]);
    expect(rest).toEqual(ordinaryRejection.slice(2).map(() => ordinaryRejection[3]));
  });
});
