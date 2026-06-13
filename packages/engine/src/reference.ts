import type { ReferenceData, ReferenceDataJson } from "./types";

/**
 * Builds an injectable ReferenceData snapshot from its JSON-friendly form.
 * Used by the eval harness (fixtures carry their own refs) and usable by any
 * caller that materializes ref_* rows as plain JSON first.
 */
export function referenceDataFromJson(json: ReferenceDataJson): ReferenceData {
  return {
    versions: json.versions,
    ncciPtp: new Set(json.ncciPtp),
    mue: new Map(Object.entries(json.mue)),
    medicareRatesCents: new Map(Object.entries(json.medicareRatesCents)),
    fapPolicies: json.fapPolicies ?? [],
    carcLiability: new Map(Object.entries(json.carcLiability ?? {})),
  };
}
