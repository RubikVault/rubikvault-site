import { getSnapshot, makeNoDataError } from "./_shared.js";

export async function run(ctx, entry) {
  const sentimentSnapshot = getSnapshot(ctx.cache, "sentiment-lite");
  const itemsList = Array.isArray(sentimentSnapshot?.data?.items) ? sentimentSnapshot.data.items : [];
  if (!itemsList.length) throw makeNoDataError("sentiment_missing");

  const avgSentiment =
    itemsList.reduce((sum, item) => sum + (Number(item.sentiment) || 0), 0) / itemsList.length;
  const velocity = itemsList.length;

  const items = [
    {
      velocity,
      avgSentiment,
      date: sentimentSnapshot?.dataAt || null
    }
  ];

  return { items, dataAt: sentimentSnapshot?.dataAt || null };
}
