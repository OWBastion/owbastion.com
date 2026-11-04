// Plain-language hints for the probability fields, shared by the Portal event detail and the admin views.
export const probabilityHints = {
  appearance: "每次触发随机事件时，抽到它的可能性。例如 5%，平均每 20 次抽到 1 次。",
  rank: "按出现概率从高到低排的名次，第 1 名最容易出现。",
  weight: "数字越大，越容易出现。到 2.5 为上限，再大也不会更容易。",
  poolSize: "能被抽到的事件总数，只算已实装、未归档、版本未暂停的事件。",
  failure: "系统每次先随机挑一个事件，权重低的可能被跳过，然后重新挑。这个数字是一次挑选就被跳过的可能性，越大越容易重挑。",
  guarantee: "系统最多挑 8 次。如果 8 次全被跳过，就不再看权重，直接用最后挑到的那个，此时每个事件机会均等。这个数字是走到这一步的可能性，通常很小。",
} as const;
