// Plain-language hints for the probability fields, shared by the Portal event detail and the admin views.
export const probabilityHints = {
  appearance: "每次触发随机事件时，抽到它的可能性。例如 5%，平均每 20 次抽到 1 次。",
  rank: "按出现概率从高到低排的名次，第 1 名最容易出现。",
  weight: "数字越大，越容易出现。到 2.5 为上限，再大也不会更容易。",
  poolSize: "能被抽到的事件总数，只算已实装、未归档、版本未暂停的事件。",
  failure: "随机挑一个事件却被拒绝、要重新挑的可能性。权重越低，越容易被拒绝。",
  guarantee: "连续挑了 8 次都被拒绝的可能性。这时不再重挑，直接用最后挑到的事件。",
} as const;
