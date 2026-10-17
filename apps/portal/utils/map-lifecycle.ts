import type { AdminMapEditorRevision } from "~/composables/useAdminMapEditor";

type Lifecycle = AdminMapEditorRevision["lifecycle"];

export const lifecycleLabels: Record<Lifecycle, string> = { preparing: "准备中", default: "正式", selectable: "可选", historical: "历史" };
export const lifecycleTone = (lifecycle: Lifecycle): "success" | "info" | "default" | "warning" => lifecycle === "default" ? "success" : lifecycle === "selectable" ? "info" : lifecycle === "historical" ? "default" : "warning";
