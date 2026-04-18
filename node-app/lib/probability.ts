/* lib/probability.ts */

export interface ProbLevel {
  price: number;
  title: string;
  color: string;
}

export function calculateProbabilityTags(closePrices: number[]): ProbLevel[] {
  const lookbackPeriod = Math.min(1000, closePrices.length);

  if (lookbackPeriod <= 10) return [];

  const recentPrices = closePrices.slice(-lookbackPeriod);
  const mean = recentPrices.reduce((a, b) => a + b, 0) / lookbackPeriod;
  const variance =
    recentPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    lookbackPeriod;
  const sd = Math.sqrt(variance);

  return [
    { price: mean + 1.645 * sd, title: "90%", color: "rgba(239, 83, 80, 0.8)" },
    { price: mean + 1.15 * sd, title: "75%", color: "rgba(239, 83, 80, 0.5)" },
    { price: mean + 0.67 * sd, title: "50%", color: "rgba(239, 83, 80, 0.3)" },
    { price: mean, title: "Mean", color: "rgba(204, 204, 204, 0.5)" },
    { price: mean - 0.67 * sd, title: "50%", color: "rgba(38, 166, 154, 0.3)" },
    { price: mean - 1.15 * sd, title: "75%", color: "rgba(38, 166, 154, 0.5)" },
    {
      price: mean - 1.645 * sd,
      title: "90%",
      color: "rgba(38, 166, 154, 0.8)",
    },
  ];
}
