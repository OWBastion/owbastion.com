export type MapVariant = "classic" | null | undefined;

export const mapVariantLabel = (variant: unknown) => variant === "classic" ? "经典版" : "正式版";
