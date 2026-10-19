export type AdminSection = { label: string; description: string; icon: string; to: string };
export type AdminSectionGroup = { label: string; icon: string; sections: AdminSection[] };

// One definition feeds the admin sidebar, the workspace breadcrumb and the overview directory.
export const adminSectionGroups: AdminSectionGroup[] = [
  { label: "内容", icon: "i-lucide-layers", sections: [
    { label: "地图", description: "地图与玩法修订", icon: "i-lucide-map", to: "/admin/maps" },
    { label: "随机事件", description: "事件与平衡元数据", icon: "i-lucide-zap", to: "/admin/events" },
    { label: "独立模式", description: "限时模式的地图、事件池与权重", icon: "i-lucide-flip-horizontal-2", to: "/admin/modes" },
    { label: "称号与挑战", description: "称号获取方式与地图挑战", icon: "i-lucide-award", to: "/admin/achievements/titles" },
  ] },
  { label: "称号运营", icon: "i-lucide-send", sections: [
    { label: "手动授予", description: "批量通过手动挑战授予称号", icon: "i-lucide-send", to: "/admin/grants" },
    { label: "称号迁移", description: "历史数据关联与修复", icon: "i-lucide-history", to: "/admin/title-migration" },
  ] },
  { label: "审核", icon: "i-lucide-scan-eye", sections: [
    { label: "截图审核", description: "待审核的提交", icon: "i-lucide-scan-eye", to: "/admin/reviews" },
    { label: "截图集", description: "OCR 样本与标注", icon: "i-lucide-images", to: "/admin/screenshot-sets" },
    { label: "评价审核", description: "玩家评价处理", icon: "i-lucide-message-square-quote", to: "/admin/player-reviews" },
    { label: "通关记录", description: "查询与冲突处理", icon: "i-lucide-trophy", to: "/admin/verified-runs" },
  ] },
  { label: "玩家", icon: "i-lucide-users", sections: [
    { label: "玩家列表", description: "身份、称号与进度", icon: "i-lucide-user-round", to: "/admin/players" },
    { label: "玩家 ID", description: "自定义 ID 的申请与清除", icon: "i-lucide-at-sign", to: "/admin/player-handles" },
    { label: "绑定与邀请", description: "冲突、换绑与首次注册", icon: "i-lucide-link", to: "/admin/bindings" },
    { label: "QQ 群组策略", description: "绑定渠道接入", icon: "i-lucide-radio", to: "/admin/channels" },
    { label: "赛季", description: "排行榜赛季的排期与可见性", icon: "i-lucide-calendar-range", to: "/admin/seasons" },
  ] },
];

// The section that owns a path; "/admin/achievements/*" belongs to the section rooted at "/admin/achievements".
const sectionRoot = (to: string) => to.replace(/\/titles$/, "");
export const adminPathActive = (path: string, to: string) => path === sectionRoot(to) || path.startsWith(`${sectionRoot(to)}/`);

export function adminSectionForPath(path: string) {
  for (const group of adminSectionGroups) {
    const section = group.sections.find((candidate) => adminPathActive(path, candidate.to));
    if (section) return { group, section };
  }
  return null;
}
