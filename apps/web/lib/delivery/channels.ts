/**
 * DeliveryChannel (U13, arch D8): every artifact offers download and
 * portal-guided delivery. Pure data — the letter page renders these; the
 * client SendPanel handles clipboard/print mechanics. Paid channels (fax,
 * certified mail) slot in here later without touching artifact generation.
 */

export type DeliveryKind = "download" | "portal_guided";

export interface DeliveryOption {
  kind: DeliveryKind;
  title: string;
  steps: string[];
}

const PORTAL_COMMON = [
  "Log into your provider's billing portal (the URL is printed on your bill).",
  'Find "Messages", "Contact billing", or "Dispute a charge".',
  "Paste the text below into the message box and send it.",
  "Screenshot the confirmation — that's your proof of delivery date.",
];

const ARTIFACT_PORTAL_STEPS: Record<string, string[]> = {
  dispute: PORTAL_COMMON,
  itemized_request: PORTAL_COMMON,
  validation: [
    "Validation demands go to the COLLECTOR, not the provider — use the address on the collection notice.",
    "If the collector lists a portal or email on the notice, paste the text there.",
    "Otherwise print and mail it — certified mail with return receipt is worth the few dollars here.",
    "Keep the mailing receipt: the 30-day clock argument may depend on it.",
  ],
  fap_application: [
    "Call the hospital billing office and ask for the financial-assistance application.",
    "Ask them to place the account on hold while your application is processed.",
    "Submit the documents in the checklist; keep copies of everything.",
  ],
  ppdr_guide: [
    "This one goes to the federal process, not the provider: start at cms.gov/nosurprises.",
    "Have the bill, your Good Faith Estimate, and the $25 fee ready.",
    "Follow the guide's steps — the 120-day clock runs from the bill date.",
  ],
};

export function deliveryOptionsFor(artifactType: string): DeliveryOption[] {
  return [
    {
      kind: "portal_guided",
      title: "Portal-guided (recommended — fastest proof of delivery)",
      steps: ARTIFACT_PORTAL_STEPS[artifactType] ?? PORTAL_COMMON,
    },
    {
      kind: "download",
      title: "Download / print and mail",
      steps: [
        "Download the text (or print this page — the letter prints clean).",
        "Sign it, and mail it to the billing address on your statement.",
        "Certified mail with return receipt gives you a dated paper trail.",
      ],
    },
  ];
}
