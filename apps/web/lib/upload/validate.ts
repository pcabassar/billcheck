/**
 * Hostile-input validation for uploads (plan U4, deepening security #5).
 * Pure functions — no I/O — so they are unit-testable and reusable.
 *
 * Allowlist: JPEG / PNG / PDF only, decided by magic bytes, never by the
 * client-supplied content type or filename. HEIC is rejected with a specific
 * reason (Sonnet vision doesn't accept it — review F6+A8); the upload page
 * omits HEIC from `accept` so iOS Safari transcodes camera/library picks to
 * JPEG, and raw stragglers land here.
 */

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB hard cap
export const MAX_PDF_PAGES = 40;

export type SniffedKind = "jpeg" | "png" | "pdf";

export type UploadRejectReason =
  | "empty_file"
  | "too_large"
  | "heic_not_supported"
  | "unsupported_type"
  | "pdf_page_limit";

export type UploadValidation =
  | { ok: true; kind: SniffedKind; contentType: string; pdfPageCount?: number }
  | { ok: false; reason: UploadRejectReason };

const CONTENT_TYPES: Record<SniffedKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  pdf: "application/pdf",
};

/** ISO-BMFF `ftyp` brands that mean HEIC/HEIF — rejected with targeted copy. */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "heif"]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/**
 * Magic-byte sniff. Returns the allowlisted kind, "heic" for a detected
 * HEIC/HEIF container, or null for everything else.
 *
 * Signatures (at offset 0 — a PDF with leading junk is rejected; that is
 * intentional, the spec-permitted 1KB preamble is a hostile-input vector):
 *   JPEG ff d8 ff · PNG 89 50 4e 47 · PDF 25 50 44 46 ("%PDF")
 */
export function sniffKind(bytes: Uint8Array): SniffedKind | "heic" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "pdf";
  }
  // ISO-BMFF: size (4 bytes) + "ftyp" + major brand (4 bytes).
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return "heic";
    return null; // other BMFF (mp4 etc.) — not allowlisted
  }
  return null;
}

/**
 * Cheap page-count heuristic: count `/Type /Page` (and `/Type/Page`) object
 * markers in the raw bytes, excluding `/Pages` nodes.
 *
 * KNOWN LIMITATION: page objects inside compressed object streams (ObjStm)
 * are invisible to this scan, so it can UNDERCOUNT — a fully-compressed PDF
 * returns 0 and passes. This is a cost gate before the LLM, not a security
 * boundary; parse-time handling (U5) is the authoritative guard. It cannot
 * be gamed *upward* into a false reject of a small document.
 */
export function countPdfPagesHeuristic(bytes: Uint8Array): number {
  // latin1: 1 byte -> 1 char, preserves the raw byte layout for the regex.
  const text = new TextDecoder("latin1").decode(bytes);
  const matches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return matches ? matches.length : 0;
}

/** Full validation gate: size cap -> magic bytes allowlist -> PDF page cap. */
export function validateUpload(bytes: Uint8Array): UploadValidation {
  if (bytes.length === 0) return { ok: false, reason: "empty_file" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "too_large" };

  const kind = sniffKind(bytes);
  if (kind === "heic") return { ok: false, reason: "heic_not_supported" };
  if (kind === null) return { ok: false, reason: "unsupported_type" };

  if (kind === "pdf") {
    const pages = countPdfPagesHeuristic(bytes);
    if (pages > MAX_PDF_PAGES) return { ok: false, reason: "pdf_page_limit" };
    return { ok: true, kind, contentType: CONTENT_TYPES.pdf, pdfPageCount: pages };
  }

  return { ok: true, kind, contentType: CONTENT_TYPES[kind] };
}
