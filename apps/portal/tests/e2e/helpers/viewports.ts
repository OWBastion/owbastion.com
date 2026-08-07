/** Representative viewports for Portal responsive regression (#63). */
export const VIEWPORTS = {
  /** Smallest common mobile width */
  mobile320: { width: 320, height: 720 },
  /** Common iPhone-class width */
  mobile375: { width: 375, height: 812 },
  /** Large phone */
  mobile430: { width: 430, height: 932 },
  /**
   * Modal/drawer boundary for AdminResponsiveDialog (`min-width: 768px` = Modal).
   * 767 = Drawer; 768 = Modal.
   */
  drawerMax: { width: 767, height: 900 },
  modalMin: { width: 768, height: 900 },
  /** Tablet */
  tablet: { width: 834, height: 1112 },
  /** Desktop */
  desktop: { width: 1280, height: 800 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;
