/**
 * Pure-function tests for upload validation (plan U4 test scenarios).
 *
 * NOTE: vitest is not yet configured for apps/web (seam — listed in the U4
 * handoff). These tests are written against the standard vitest API so they
 * run unchanged once `vitest` + a config land in apps/web.
 */
import { describe, expect, it } from "vitest";

import {
  countPdfPagesHeuristic,
  MAX_PDF_PAGES,
  MAX_UPLOAD_BYTES,
  sniffKind,
  validateUpload,
} from "./validate";

function bytesOf(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function asciiBytes(text: string): Uint8Array {
  return Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
}

/** Minimal ISO-BMFF header: [size:4]["ftyp"][brand:4]. */
function bmff(brand: string): Uint8Array {
  return Uint8Array.from([0, 0, 0, 24, ...asciiBytes("ftyp" + brand), 0, 0, 0, 0]);
}

describe("sniffKind", () => {
  it("detects JPEG by ff d8 ff", () => {
    expect(sniffKind(bytesOf(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe("jpeg");
  });

  it("detects PNG by 89 50 4e 47", () => {
    expect(sniffKind(bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
  });

  it("detects PDF by %PDF at offset 0", () => {
    expect(sniffKind(asciiBytes("%PDF-1.7\n"))).toBe("pdf");
  });

  it("rejects a PDF signature not at offset 0 (preamble junk)", () => {
    expect(sniffKind(asciiBytes("junk%PDF-1.7"))).toBeNull();
  });

  it("flags HEIC brands specifically", () => {
    for (const brand of ["heic", "heix", "mif1"]) {
      expect(sniffKind(bmff(brand))).toBe("heic");
    }
  });

  it("does not allowlist other BMFF containers (mp4)", () => {
    expect(sniffKind(bmff("isom"))).toBeNull();
  });

  it("returns null for unknown bytes and for content-type lies", () => {
    // A GIF claiming to be image/jpeg is judged by bytes, not by the claim.
    expect(sniffKind(asciiBytes("GIF89a"))).toBeNull();
    expect(sniffKind(bytesOf(0x00, 0x01, 0x02, 0x03))).toBeNull();
  });

  it("handles short buffers without throwing", () => {
    expect(sniffKind(bytesOf())).toBeNull();
    expect(sniffKind(bytesOf(0xff))).toBeNull();
  });
});

describe("countPdfPagesHeuristic", () => {
  it("counts /Type /Page occurrences with and without space", () => {
    const pdf = asciiBytes(
      "%PDF-1.4\n1 0 obj << /Type /Page >>\n2 0 obj << /Type/Page >>\n3 0 obj << /Type /Page >>",
    );
    expect(countPdfPagesHeuristic(pdf)).toBe(3);
  });

  it("does not count /Type /Pages tree nodes", () => {
    const pdf = asciiBytes("%PDF-1.4\n1 0 obj << /Type /Pages /Kids [] >>\n2 0 obj << /Type /Page >>");
    expect(countPdfPagesHeuristic(pdf)).toBe(1);
  });

  it("returns 0 for compressed PDFs where page objects are invisible (documented limitation)", () => {
    expect(countPdfPagesHeuristic(asciiBytes("%PDF-1.7\nstream...endstream"))).toBe(0);
  });
});

describe("validateUpload", () => {
  it("rejects empty files", () => {
    expect(validateUpload(bytesOf())).toEqual({ ok: false, reason: "empty_file" });
  });

  it("rejects files over the 20MB cap", () => {
    const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    big[0] = 0xff;
    big[1] = 0xd8;
    big[2] = 0xff;
    expect(validateUpload(big)).toEqual({ ok: false, reason: "too_large" });
  });

  it("accepts a file exactly at the cap", () => {
    const exact = new Uint8Array(MAX_UPLOAD_BYTES);
    exact[0] = 0xff;
    exact[1] = 0xd8;
    exact[2] = 0xff;
    expect(validateUpload(exact)).toMatchObject({ ok: true, kind: "jpeg" });
  });

  it("rejects raw HEIC with its own reason code", () => {
    expect(validateUpload(bmff("heic"))).toEqual({ ok: false, reason: "heic_not_supported" });
  });

  it("rejects everything not on the allowlist", () => {
    expect(validateUpload(asciiBytes("GIF89a..."))).toEqual({ ok: false, reason: "unsupported_type" });
  });

  it("accepts a PDF within the page cap and sets the server content type", () => {
    const pdf = asciiBytes("%PDF-1.4\n<< /Type /Page >>");
    expect(validateUpload(pdf)).toEqual({
      ok: true,
      kind: "pdf",
      contentType: "application/pdf",
      pdfPageCount: 1,
    });
  });

  it("rejects a PDF over the page cap", () => {
    const body = Array.from({ length: MAX_PDF_PAGES + 1 }, () => "<< /Type /Page >>").join("\n");
    expect(validateUpload(asciiBytes("%PDF-1.4\n" + body))).toEqual({
      ok: false,
      reason: "pdf_page_limit",
    });
  });

  it("sets image/png for PNG (server-set content type, never client claim)", () => {
    const png = bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    expect(validateUpload(png)).toEqual({ ok: true, kind: "png", contentType: "image/png" });
  });
});
