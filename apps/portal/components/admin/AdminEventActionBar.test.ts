import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminEventActionBar from "./AdminEventActionBar.vue";

const mountBar = (selectedCount: number, draftCount: number) => mountSuspended(AdminEventActionBar, {
  props: { selectedCount, draftCount, summary: "权重 2 项", saving: false, versions: ["1.0"], groups: ["组"] },
});
const labels = (wrapper: Awaited<ReturnType<typeof mountBar>>) => wrapper.findAll("button").map((button) => button.text());

describe("AdminEventActionBar", () => {
  it("shows bulk controls and 取消选择 for a selection alone", async () => {
    const wrapper = await mountBar(2, 0);
    expect(wrapper.text()).toContain("已选 2 项");
    expect(labels(wrapper)).toContain("应用");
    expect(labels(wrapper)).toContain("取消选择");
    expect(labels(wrapper)).not.toContain("保存全部");
  });

  it("shows the draft summary with 放弃 / 保存全部 for drafts alone", async () => {
    const wrapper = await mountBar(0, 3);
    expect(wrapper.text()).toContain("3 项未保存的修改");
    expect(wrapper.text()).toContain("权重 2 项");
    expect(labels(wrapper)).toEqual(expect.arrayContaining(["放弃", "保存全部"]));
    expect(labels(wrapper)).not.toContain("应用");
  });

  it("shows bulk controls and a single 放弃 / 保存全部 pair without 取消选择 when both exist", async () => {
    const wrapper = await mountBar(2, 3);
    expect(wrapper.text()).toContain("已选 2 项");
    expect(wrapper.text()).toContain("3 项未保存");
    expect(labels(wrapper)).toContain("应用");
    expect(labels(wrapper).filter((label) => label === "放弃")).toHaveLength(1);
    expect(labels(wrapper).filter((label) => label === "保存全部")).toHaveLength(1);
    expect(labels(wrapper)).not.toContain("取消选择");
  });

  it("renders nothing without a selection or drafts", async () => {
    const wrapper = await mountBar(0, 0);
    expect(wrapper.find(".action-bar").exists()).toBe(false);
    expect(wrapper.findAll("button")).toHaveLength(0);
  });
});
