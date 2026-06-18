// Persona population — derived from our taxonomy (insurance × document-type ×
// behavioral), NOT free-form. Oversamples the dangerous cells:
// "statement-mistaken-for-final-bill" and "looks-fine-but-isn't (hidden duplicate)".

import type { CaseInput } from "../src/core/agent";
import type { VerdictKind } from "../src/core/types";

export interface Persona {
  id: string;
  dims: { insurance: string; docType: string; behavior: string };
  input: CaseInput;
  expect: VerdictKind;
  note?: string;
}

const eob = (billed: number, allowed: number, paid: number, resp: number) => ({
  billedCents: billed,
  allowedCents: allowed,
  planPaidCents: paid,
  patientRespCents: resp,
});

export const PERSONAS: Persona[] = [
  // --- common path #1: statement → don't pay yet (oversampled) ---
  {
    id: "stmt-clear-imaging",
    dims: { insurance: "commercial-FI", docType: "statement", behavior: "anxious" },
    input: { docs: [{ id: "d", kind: "statement", provider: "Northwest Imaging", printedTotalCents: 120000 }] },
    expect: "hold",
  },
  {
    id: "stmt-hospital",
    dims: { insurance: "commercial-SF", docType: "statement", behavior: "non-assertion" },
    input: { docs: [{ id: "d", kind: "statement", provider: "City Hospital", printedTotalCents: 480000 }] },
    expect: "hold",
    note: "non-assertion default user who would otherwise just pay the statement",
  },
  {
    id: "stmt-mistaken-final",
    dims: { insurance: "uninsured", docType: "statement", behavior: "ready-to-pay" },
    input: { docs: [{ id: "d", kind: "statement", provider: "Anesthesia Group", printedTotalCents: 300000 }] },
    expect: "hold",
    note: "DANGEROUS CELL: statement mistaken for the final bill",
  },
  // --- common path #2: itemized + EOB clean → looks correct ---
  {
    id: "clean-mri",
    dims: { insurance: "commercial-FI", docType: "itemized+eob", behavior: "verify" },
    input: {
      docs: [
        { id: "bill", kind: "itemized", provider: "NW Imaging", lines: [{ code: "73721", description: "MRI knee", amountCents: 120000 }] },
        { id: "eob", kind: "eob", provider: "BlueCross", eob: eob(120000, 48000, 45000, 3000) },
      ],
    },
    expect: "ok",
  },
  {
    id: "clean-officevisit",
    dims: { insurance: "medicare-adv", docType: "itemized+eob", behavior: "verify" },
    input: {
      docs: [
        { id: "bill", kind: "itemized", provider: "Family Clinic", lines: [{ code: "99213", description: "Office visit", amountCents: 24000 }] },
        { id: "eob", kind: "eob", provider: "UHC", eob: eob(24000, 11000, 9000, 2000) },
      ],
    },
    expect: "ok",
  },
  // --- dispute path: duplicate flagged → something's off ---
  {
    id: "dup-er",
    dims: { insurance: "commercial-FI", docType: "itemized+eob", behavior: "suspicious" },
    input: {
      docs: [
        {
          id: "bill",
          kind: "itemized",
          provider: "City ER",
          lines: [
            { code: "99284", description: "ER visit", amountCents: 45000 },
            { code: "99284", description: "ER visit", amountCents: 45000 },
            { code: "80050", description: "Labs", amountCents: 12000 },
          ],
        },
        { id: "eob", kind: "eob", provider: "Aetna", eob: eob(231000, 124000, 62000, 62000) },
      ],
    },
    expect: "off",
  },
  {
    id: "dup-hidden-lookfine",
    dims: { insurance: "commercial-SF", docType: "itemized+eob", behavior: "trusting" },
    input: {
      docs: [
        {
          id: "bill",
          kind: "itemized",
          provider: "Surgery Center",
          lines: [
            { code: "45380", description: "Colonoscopy", amountCents: 540000 },
            { code: "45380", description: "Colonoscopy", amountCents: 540000 },
          ],
        },
        { id: "eob", kind: "eob", provider: "Cigna", eob: eob(1080000, 600000, 400000, 200000) },
      ],
    },
    expect: "off",
    note: "DANGEROUS CELL: looks-fine-but-isn't — a naive agent might say 'ok'; the hidden duplicate must surface",
  },
  // --- charged-and-surprised (Two Chairs) ---
  {
    id: "charged-no-invoice",
    dims: { insurance: "commercial-FI", docType: "none", behavior: "surprised" },
    input: { docs: [], message: "Two Chairs charged my card $179 but never sent an itemized invoice.", signals: { chargedNoInvoice: true } },
    expect: "dispute",
  },
  // --- need-more / conservative defaults ---
  {
    id: "lowq-statement",
    dims: { insurance: "unknown", docType: "statement", behavior: "phone-photo" },
    input: { docs: [{ id: "d", kind: "statement", provider: "blurry", quality: "low" }] },
    expect: "need_more",
    note: "low parse quality → don't guess; ask for a clearer/the right doc",
  },
  {
    id: "eob-only",
    dims: { insurance: "commercial-FI", docType: "eob-only", behavior: "confused" },
    input: { docs: [{ id: "eob", kind: "eob", provider: "BCBS", eob: eob(90000, 40000, 38000, 2000) }] },
    expect: "need_more",
    note: "EOB but no bill yet → wait for / request the bill",
  },
  {
    id: "itemized-only",
    dims: { insurance: "commercial-FI", docType: "itemized-only", behavior: "eager" },
    input: { docs: [{ id: "bill", kind: "itemized", provider: "Clinic", lines: [{ code: "99213", description: "Visit", amountCents: 24000 }] }] },
    expect: "need_more",
    note: "bill but no EOB → can't confirm what's owed yet",
  },
  {
    id: "clean-highbill",
    dims: { insurance: "commercial-FI", docType: "itemized+eob", behavior: "sticker-shock" },
    input: {
      docs: [
        { id: "bill", kind: "itemized", provider: "Hospital", lines: [{ code: "27447", description: "Knee replacement", amountCents: 5800000 }] },
        { id: "eob", kind: "eob", provider: "BCBS", eob: eob(5800000, 2200000, 2150000, 50000) },
      ],
    },
    expect: "ok",
    note: "huge charge but correctly adjudicated — reassurance + permission",
  },
];
