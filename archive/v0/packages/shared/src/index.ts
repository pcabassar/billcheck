export { log, logError, type LogFields } from "./logger";
export {
  callLlm,
  createLlmClient,
  LlmNotWiredError,
  LlmValidationError,
  PhaseGateError,
  SpendAlarmError,
  zodToJsonSchema,
  MODEL_ID,
  PHASE,
  type AiCallRow,
  type CreateLlmClientOpts,
  type JsonSchema,
  type LlmCallInput,
  type LlmCallResult,
  type LlmClient,
  type LlmPurpose,
  type LlmSchema,
  type LlmTransport,
  type LlmTransportContentBlock,
  type LlmTransportRequest,
  type LlmTransportResponse,
} from "./llm/client";
export { estimateCostCents, rateFor, sumCostCents } from "./llm/cost";
export { ClassifyResult, ParsedBill, ParsedBillLineItem } from "./schemas/parsed-bill";
export { ParsedEob, ParsedEobCarc } from "./schemas/parsed-eob";
export {
  buildLetterFillPrompt,
  formatCents,
  LETTER_FACT_ATTESTATION,
  LETTER_FILL_PROMPT_VERSION,
  LETTER_FILL_SYSTEM_PROMPT,
  LetterFactsFill,
  renderDisputeLetter,
  type DisputeLetterFinding,
  type DisputeLetterInput,
  type LetterFactsFillOutput,
} from "./letters/templates";
export {
  validateLetter,
  type LetterValidationResult,
  type LetterViolation,
  type LetterViolationKind,
} from "./letters/validate";
export * from "./types";
export {
  computeRoutingFlags,
  TriageAnswers,
  type CoverageProfile,
  type RoutingFlags,
  type TriState,
} from "./triage";
export {
  renderFapChecklist,
  renderItemizedRequest,
  renderPpdrGuide,
  renderValidationLetter,
  type FapChecklistInput,
  type ItemizedRequestInput,
  type PpdrGuideInput,
  type ValidationLetterInput,
} from "./letters/static-templates";
