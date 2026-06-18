/**
 * LLM cost estimation (spend alarm). Token prices in cents per 1M tokens,
 * by model. Used to sum rolling ai_calls spend against a kill-switch ceiling
 * — a coarse global budget cap, distinct from the per-account rate limit.
 *
 * Prices are conservative list rates (cents/1M): if a model is unknown we
 * fall back to the most expensive known rate so an unrecognized model can
 * never UNDER-count spend and slip past the cap.
 */
interface Rate {
  inputCentsPerM: number;
  outputCentsPerM: number;
}

const RATES: Record<string, Rate> = {
  "claude-sonnet-4-6": { inputCentsPerM: 300, outputCentsPerM: 1500 },
  "claude-opus-4-8": { inputCentsPerM: 500, outputCentsPerM: 2500 },
  "claude-haiku-4-5": { inputCentsPerM: 100, outputCentsPerM: 500 },
  "claude-fable-5": { inputCentsPerM: 1000, outputCentsPerM: 5000 },
};

const FALLBACK: Rate = { inputCentsPerM: 1000, outputCentsPerM: 5000 };

export function rateFor(modelId: string): Rate {
  return RATES[modelId] ?? FALLBACK;
}

/** Estimated cost in cents for one call's token usage. Nulls count as 0. */
export function estimateCostCents(
  modelId: string,
  tokensIn: number | null,
  tokensOut: number | null,
): number {
  const rate = rateFor(modelId);
  const inCost = ((tokensIn ?? 0) / 1_000_000) * rate.inputCentsPerM;
  const outCost = ((tokensOut ?? 0) / 1_000_000) * rate.outputCentsPerM;
  return inCost + outCost;
}

/** Sum estimated cost across many ai_calls rows. */
export function sumCostCents(
  rows: Array<{ model_id: string; tokens_in: number | null; tokens_out: number | null }>,
): number {
  return rows.reduce((sum, r) => sum + estimateCostCents(r.model_id, r.tokens_in, r.tokens_out), 0);
}
