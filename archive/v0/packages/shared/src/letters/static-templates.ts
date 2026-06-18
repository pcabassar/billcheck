import { formatCents } from "./templates";

/**
 * Static artifact templates (U13): validation, itemized request, FAP
 * checklist, PPDR guide. NO LLM ANYWHERE — these render deterministically
 * from typed case facts. Bracketed [PLACEHOLDERS] mark what the user fills
 * before sending; the approval UI surfaces them.
 */

export interface ValidationLetterInput {
  /** Collector name as read from the uploaded collection notice. */
  collectorName: string;
  /** Account/reference number from the notice, if extracted. */
  accountNumber: string | null;
  /** Amount the notice demands, if known (integer cents). */
  demandedCents: number | null;
}

/**
 * FDCPA §1692g debt-validation demand. Gated on the actual collection
 * notice (review A3): FDCPA rights attach to third-party collectors — the
 * notice is what proves one is involved.
 */
export function renderValidationLetter(input: ValidationLetterInput): string {
  const account = input.accountNumber ?? "[ACCOUNT NUMBER FROM THE NOTICE]";
  const amount = input.demandedCents !== null ? formatCents(input.demandedCents) : "[AMOUNT ON THE NOTICE]";
  return [
    `To: ${input.collectorName}`,
    "",
    "Re: Debt validation request — account " + account,
    "",
    "I am responding to your collection notice regarding the above account.",
    "",
    `I dispute this debt of ${amount} and request validation under the Fair Debt Collection Practices Act, 15 U.S.C. § 1692g.`,
    "",
    "Specifically, provide:",
    "1. An itemized accounting of the alleged debt, including the original creditor's name and address;",
    "2. Proof that you are licensed to collect in my state and authorized to collect this debt;",
    "3. A copy of the original signed agreement or other documentation establishing my obligation.",
    "",
    "Until you provide this validation, federal law requires you to cease collection activity. Do not report this debt to any credit bureau while it remains unvalidated; if it has been reported, notify the bureaus that it is disputed.",
    "",
    "All future communication about this account must be in writing.",
    "",
    "Sincerely,",
    "[YOUR NAME]",
    "[YOUR ADDRESS]",
  ].join("\n");
}

export interface ItemizedRequestInput {
  providerName: string | null;
  accountNumber: string | null;
  dateOfService: string | null;
}

/** S9-lite: the free, always-available itemized-bill request. */
export function renderItemizedRequest(input: ItemizedRequestInput): string {
  const provider = input.providerName ?? "[PROVIDER NAME]";
  const account = input.accountNumber ?? "[ACCOUNT NUMBER]";
  const dos = input.dateOfService ?? "[DATE OF SERVICE]";
  return [
    `To: ${provider} — Billing Department`,
    "",
    `Re: Request for itemized bill — account ${account}, date of service ${dos}`,
    "",
    "Please send me a fully itemized bill for the above account, including:",
    "1. Each service billed, with its CPT/HCPCS or revenue code;",
    "2. The charge, units, and date for each line;",
    "3. All payments and adjustments applied to date.",
    "",
    "I am entitled to this statement and will review the charges upon receipt. Please pause any payment deadline or collection activity until it arrives.",
    "",
    "Sincerely,",
    "[YOUR NAME]",
  ].join("\n");
}

export interface FapChecklistInput {
  hospitalName: string | null;
  /** Published thresholds when the hospital is in our seeded set. */
  thresholdFreeFpl: number | null;
  thresholdDiscountFpl: number | null;
  sourceUrl: string | null;
}

/** FAP application checklist — specific when seeded, honest-generic otherwise. */
export function renderFapChecklist(input: FapChecklistInput): string {
  const name = input.hospitalName ?? "your hospital";
  const head = [
    `Financial assistance application — ${name}`,
    "",
    "Nonprofit hospitals are required by IRS rules (section 501(r)) to offer financial assistance and to publish the policy. Applications are generally accepted until at least 240 days after the first bill.",
    "",
  ];
  const policy = input.thresholdFreeFpl !== null || input.thresholdDiscountFpl !== null
    ? [
        "Their published thresholds:",
        ...(input.thresholdFreeFpl !== null
          ? [`- FREE care at or below ${input.thresholdFreeFpl}× the federal poverty level`]
          : []),
        ...(input.thresholdDiscountFpl !== null
          ? [`- DISCOUNTED care at or below ${input.thresholdDiscountFpl}× the federal poverty level`]
          : []),
        ...(input.sourceUrl ? [`- Policy: ${input.sourceUrl}`] : []),
        "",
      ]
    : [
        "We don't have this hospital's published thresholds yet — ask their billing office for the \"financial assistance policy\" or \"charity care application\" (they are required to provide it).",
        "",
      ];
  const steps = [
    "What to gather:",
    "1. Proof of income: last 2 pay stubs, or last year's tax return, or a benefits letter;",
    "2. Household size (who lives with you and depends on the income);",
    "3. The bill and account number;",
    "4. ID.",
    "",
    "How to apply:",
    "1. Call the billing office and say: \"I'd like to apply for financial assistance under your published policy.\"",
    "2. Ask them to place the account on hold while the application is processed — they generally must;",
    "3. Submit the application and keep a copy;",
    "4. If denied, ask for the denial in writing and the appeal process.",
  ];
  return [...head, ...policy, ...steps].join("\n");
}

export interface PpdrGuideInput {
  gfeCents: number | null;
  billedCents: number | null;
}

/** Patient-Provider Dispute Resolution walkthrough (C8 lever). */
export function renderPpdrGuide(input: PpdrGuideInput): string {
  const delta =
    input.gfeCents !== null && input.billedCents !== null
      ? formatCents(input.billedCents - input.gfeCents)
      : "[BILL MINUS ESTIMATE]";
  return [
    "Federal Patient-Provider Dispute Resolution (PPDR) — your walkthrough",
    "",
    `Your bill exceeds your written Good Faith Estimate by ${delta} — past the $400 federal trigger, you can take it to an independent reviewer.`,
    "",
    "The deadline: you must START the process within 120 calendar days of the DATE ON THE BILL. Find that date now and mark it.",
    "",
    "Steps:",
    "1. Go to cms.gov/nosurprises and select the patient dispute-resolution start point (or call the No Surprises Help Desk at 1-800-985-3059);",
    "2. You'll need: the bill, your Good Faith Estimate, and the $25 administrative fee (refunded if you win);",
    "3. While the dispute is pending, the provider cannot send the bill to collections and must pause it;",
    "4. The reviewer compares the bill to your estimate — if they side with you, you pay the estimate (plus at most allowed differences), not the bill.",
    "",
    "Keep copies of everything you submit.",
  ].join("\n");
}
