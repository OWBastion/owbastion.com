export type AdminSection = { label: string; icon: string; to: string };
export type AdminSectionGroup = { label: string; icon: string; sections: AdminSection[] };

// One definition feeds the admin sidebar, the workspace breadcrumb and the overview directory.
export const adminSectionGroups: AdminSectionGroup[] = [
  { label: "内容", icon: "i-lucide-layers", sections: [
    { label: "地图", icon: "i-lucide-map", to: "/admin/maps" },
    { label: "随机事件", icon: "i-lucide-zap", to: "/admin/events" },
    { label: "独立模式", icon: "i-lucide-flip-horizontal-2", to: "/admin/modes" },
    { label: "称号与挑战", icon: "i-lucide-award", to: "/admin/achievements/titles" },
  ] },
  { label: "称号运营", icon: "i-lucide-send", sections: [
    { label: "手动授予", icon: "i-lucide-send", to: "/admin/grants" },
    { label: "称号迁移", icon: "i-lucide-history", to: "/admin/title-migration" },
  ] },
  { label: "审核", icon: "i-lucide-scan-eye", sections: [
    { label: "截图审核", icon: "i-lucide-scan-eye", to: "/admin/reviews" },
    { label: "截图集", icon: "i-lucide-images", to: "/admin/screenshot-sets" },
    { label: "评价审核", icon: "i-lucide-message-square-quote", to: "/admin/player-reviews" },
    { label: "通关记录", icon: "i-lucide-trophy", to: "/admin/verified-runs" },
  ] },
  { label: "玩家", icon: "i-lucide-users", sections: [
    { label: "玩家列表", icon: "i-lucide-user-round", to: "/admin/players" },
    { label: "玩家 ID", icon: "i-lucide-at-sign", to: "/admin/player-handles" },
    { label: "绑定与邀请", icon: "i-lucide-link", to: "/admin/bindings" },
    { label: "邀请", icon: "i-lucide-ticket", to: "/admin/invitations" },
    { label: "QQ 群组策略", icon: "i-lucide-radio", to: "/admin/channels" },
    { label: "赛季", icon: "i-lucide-calendar-range", to: "/admin/seasons" },
  ] },
];

// A section owns its path and below; "/admin/achievements/*" belongs to the section rooted at "/admin/achievements".
const sectionRoot = (to: string) => to.replace(/\/titles$/, "");
export const adminPathActive = (path: string, to: string) => path === sectionRoot(to) || path.startsWith(`${sectionRoot(to)}/`);
