import { z } from "zod";

/**
 * Bounded dispute-letter template (plan U9 / review A4).
 *
 * Boundary rule: ALL statutory-tone and claim-bearing language lives in the
 * fixed scaffold below. The LLM fills ONLY the delimited {{FACTS_i}} slots —
 * 2-3 sentence factual restatements of each finding's evidence. It cannot add
 * demands, statutes, accusations, or dollar figures: the fill prompt forbids
 * numbers entirely, and every dollar figure in the rendered letter is injected
 * by the scaffold from findings' amount_impact_cents, then re-verified by
 * validateLetter (fail closed) before the letter is persisted.
 *
 * Slot substitution is single-pass: values inserted into slots are never
 * re-scanned, so `{{...}}` sequences inside LLM output cannot expand slots.
 */

/** The fact-attestation the user accepts at approval (plan review A4). */
export const LETTER_FACT_ATTESTATION =
  "I confirm these facts are accurate; this letter is sent in my name.";

export interface DisputeLetterFinding {
  title: string;
  /** Integer cents (AGENTS.md rule: money is integer cents everywhere). */
  amountImpactCents: number | null;
  /** Engine-produced evidence notes — deterministic, never LLM output. */
  evidenceNotes: string[];
  /** The LLM-filled {{FACTS_i}} slot content for this finding. */
  factText: string;
}

export interface DisputeLetterInput {
  userName: string | null;
  provider: string;
  accountNumber: string | null;
  dateOfService: string | null;
  findings: DisputeLetterFinding[];
}

/**
 * Deterministic integer-cents -> "$1,710.00" formatter. No floats: the cents
 * value is split with integer math only.
 */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("formatCents requires an integer cents value");
  }
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rem = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${rem}`;
}

/**
 * Fixed scaffold. Statutory-tone language (itemized-statement demand, 30-day
 * written response, collections pause request) and the not-legal-advice footer
 * live HERE and only here.
 */
const LETTER_SCAFFOLD = `{{SENDER_NAME}}
{{DATE}}

To: {{PROVIDER}}
Attn: Billing Department

RE: Formal dispute of billed charges
Account: {{ACCOUNT_NUMBER}}
Date(s) of service: {{DATE_OF_SERVICE}}

To whom it may concern:

I am writing to dispute specific charges on the bill referenced above. I have reviewed this bill and identified the issues listed below. For each disputed item I have stated the factual basis for the dispute.

{{FINDINGS_SECTION}}

I therefore request that you:

1. Provide a complete itemized statement for this account, including the procedure code, date of service, units, and charge amount for every line;
2. Investigate each disputed item above against your billing records and supporting documentation; and
3. Provide a written response addressing each disputed item within 30 days of receipt of this letter.

I further request that the disputed amounts not be referred to collections, and that no adverse credit reporting occur, while this dispute is pending.

This letter states my own good-faith review of this bill. It is a request for investigation and correction of billing errors, not an accusation of intentional wrongdoing.

Sincerely,

{{SENDER_NAME}}

----------------------------------------------------------------------
This letter was prepared with the help of a software tool that checks
medical bills for common billing errors. It is not legal advice, and no
attorney-client relationship is created by preparing or sending it.`;

/** Per-finding block. {{FACTS_i}} and {{LINE_REFS}} are the only LLM-adjacent slots. */
const FINDING_BLOCK = `{{INDEX}}. {{TITLE}}{{AMOUNT_CLAUSE}}

{{FACTS_i}}

Line references: {{LINE_REFS}}`;

/** Single-pass slot fill: replacement values are never re-scanned. */
function fillSlots(template: string, slots: Record<string, string>): string {
  return template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(slots, key) ? slots[key] : whole,
  );
}

/** Strip slot delimiters from dynamic values so output never contains live-looking slots. */
function sanitizeSlotValue(value: string): string {
  return value.replace(/\{\{|\}\}/g, "").trim();
}

function formatLetterDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Renders the final plain-text dispute letter from the fixed scaffold + filled slots. */
export function renderDisputeLetter(input: DisputeLetterInput): string {
  const findingsSection = input.findings
    .map((f, i) => {
      const amountClause =
        f.amountImpactCents == null
          ? ""
          : ` — disputed amount: ${formatCents(f.amountImpactCents)}`;
      const lineRefs =
        f.evidenceNotes.length > 0
          ? f.evidenceNotes.map(sanitizeSlotValue).join("; ")
          : "see the itemized statement requested below";
      return fillSlots(FINDING_BLOCK, {
        INDEX: String(i + 1),
        TITLE: sanitizeSlotValue(f.title),
        AMOUNT_CLAUSE: amountClause,
        FACTS_i: sanitizeSlotValue(f.factText),
        LINE_REFS: lineRefs,
      });
    })
    .join("\n\n");

  return fillSlots(LETTER_SCAFFOLD, {
    SENDER_NAME: input.userName?.trim() || "[Your name]",
    DATE: formatLetterDate(new Date()),
    PROVIDER: input.provider.trim() || "[Provider name]",
    ACCOUNT_NUMBER: input.accountNumber?.trim() || "[account number]",
    DATE_OF_SERVICE: input.dateOfService?.trim() || "[date of service]",
    FINDINGS_SECTION: findingsSection,
  });
}

// ---------------------------------------------------------------- FILL slots

export const LETTER_FILL_PROMPT_VERSION = "letter-fill-v1";

/**
 * System prompt for the FACTS fill call. Numbers are forbidden outright —
 * every figure in the letter comes from the scaffold, and validateLetter
 * blocks any that slip through (plan review A1).
 */
export const LETTER_FILL_SYSTEM_PROMPT = [
  "You draft short factual restatements for a consumer's medical-bill dispute letter.",
  "For each numbered finding, write a 2-3 sentence neutral, factual restatement of that finding's evidence, in first person on behalf of the patient.",
  "Hard rules:",
  "- Do not write any numbers: no dollar amounts, dates, quantities, percentages, or billing codes.",
  "- Do not quote any text. Do not use quotation marks of any kind.",
  "- Do not cite statutes, make legal claims or demands, or accuse anyone of fraud or intent.",
  "- Do not invent facts beyond the provided finding title and evidence notes.",
  "- Use plain professional language with no rhetorical escalation.",
  "Return exactly one restatement per finding, in the same order, as JSON: { \"facts\": string[] }.",
].join("\n");

/** Builds the user prompt from finding titles + evidence notes only — never raw document text. */
export function buildLetterFillPrompt(
  findings: Array<{ title: string; evidenceNotes: string[] }>,
): string {
  const blocks = findings.map((f, i) => {
    const notes =
      f.evidenceNotes.length > 0
        ? f.evidenceNotes.map((n) => `  - ${n}`).join("\n")
        : "  - (no additional evidence notes)";
    return `Finding ${i + 1}: ${f.title}\nEvidence notes:\n${notes}`;
  });
  return [
    `There are ${findings.length} finding(s). Write one factual restatement per finding.`,
    ...blocks,
  ].join("\n\n");
}

/** Structured-output schema for the FACTS fill call. */
export const LetterFactsFill = z.object({
  facts: z.array(z.string().min(1)).min(1),
});
export type LetterFactsFillOutput = z.infer<typeof LetterFactsFill>;
