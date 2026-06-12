"use client";

import { useRef, useState } from "react";
import { QualityPanel, RejectPanel } from "./reject";

/**
 * S2 — multi-doc capture (plan U4). Client component: camera/file input,
 * sequential POSTs to /api/documents (first success pins the caseId so a
 * multi-file batch lands on one case), per-file state, inline S2b reject
 * panel for the first non-bill doc, dedupe sheet (continue existing case vs.
 * different bill), and re-shoot guidance on blurry/partial quality.
 *
 * accept deliberately omits HEIC (review F6+A8): iOS Safari then transcodes
 * camera/library picks to JPEG; raw HEIC stragglers get a 400 with
 * export-as-JPEG copy from the server's magic-byte gate.
 */

type UploadResponse = {
  documentId: string;
  caseId: string;
  kind: string;
  quality: string;
  dedupe?: { existingCaseId: string };
  byteIdentical?: boolean;
};

type EntryStatus = "uploading" | "done" | "rejected" | "dedupe" | "failed";

type FileEntry = {
  id: number;
  name: string;
  status: EntryStatus;
  errorCode?: string;
  response?: UploadResponse;
  /** Retained so the dedupe sheet can re-post into the existing case. */
  file?: File;
};

const ERROR_COPY: Record<string, string> = {
  too_large: "Over 20MB — re-export it smaller, or photograph the pages instead.",
  heic_not_supported:
    "iPhone HEIC photos aren’t supported — export as JPEG, or re-take it with the camera button here (that sends JPEG).",
  unsupported_type: "We accept JPEG and PNG photos and PDF files.",
  pdf_page_limit: "Over 40 pages — split the PDF and upload the billing pages.",
  empty_file: "That file was empty — try selecting it again.",
  rate_limited: "You’ve hit the hourly upload limit (20 files). Take a breath and try again in a bit.",
  classify_failed: "We couldn’t read this just now — give it another try.",
  case_not_found: "We couldn’t find that case — start a fresh upload.",
  unauthenticated: "Your session expired — go back to the home page and start again.",
};

export default function UploadPage() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextId = useRef(1);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function patchEntry(id: number, patch: Partial<FileEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  async function postFile(file: File, targetCaseId: string | null): Promise<
    | { ok: true; body: UploadResponse }
    | { ok: false; errorCode: string }
  > {
    const form = new FormData();
    form.append("file", file);
    if (targetCaseId) form.append("caseId", targetCaseId);
    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as
        | (UploadResponse & { error?: string })
        | null;
      if (!res.ok || !body || body.error) {
        return { ok: false, errorCode: body?.error ?? `http_${res.status}` };
      }
      return { ok: true, body };
    } catch {
      return { ok: false, errorCode: "network" };
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0 || busy) return;
    setBusy(true);
    let activeCaseId = caseId;

    // Sequential, not parallel: keeps one caseId thread and honest rate limits.
    for (const file of Array.from(list)) {
      const id = nextId.current++;
      setEntries((prev) => [...prev, { id, name: file.name, status: "uploading", file }]);

      const result = await postFile(file, activeCaseId);
      if (!result.ok) {
        patchEntry(id, { status: "failed", errorCode: result.errorCode });
        continue;
      }

      const body = result.body;
      if (body.dedupe) {
        patchEntry(id, { status: "dedupe", response: body });
        continue; // user decides before we pin a caseId for the batch
      }
      if (!activeCaseId) {
        activeCaseId = body.caseId;
        setCaseId(body.caseId);
      }
      patchEntry(id, { status: body.kind === "bill" ? "done" : "rejected", response: body });
    }
    setBusy(false);
  }

  async function resolveDedupe(entry: FileEntry, continueExisting: boolean) {
    if (!entry.response) return;
    if (!continueExisting) {
      // "Different bill": the server already parked it on its own case.
      if (!caseId) setCaseId(entry.response.caseId);
      patchEntry(entry.id, {
        status: entry.response.kind === "bill" ? "done" : "rejected",
        response: { ...entry.response, dedupe: undefined },
      });
      return;
    }
    const existingCaseId = entry.response.dedupe!.existingCaseId;
    if (!entry.file) return;
    patchEntry(entry.id, { status: "uploading" });
    const result = await postFile(entry.file, existingCaseId);
    if (!result.ok) {
      patchEntry(entry.id, { status: "failed", errorCode: result.errorCode });
      return;
    }
    setCaseId(existingCaseId);
    patchEntry(entry.id, {
      status: result.body.kind === "bill" ? "done" : "rejected",
      response: result.body,
    });
  }

  const firstClassified = entries.find(
    (e) => (e.status === "done" || e.status === "rejected") && e.response,
  );
  const showKindReject = firstClassified?.response && firstClassified.response.kind !== "bill";
  const qualityIssue = entries.find(
    (e) => e.response && (e.response.quality === "blurry" || e.response.quality === "partial"),
  );
  const hasBill = entries.some((e) => e.status === "done" && e.response?.kind === "bill");
  const pendingDedupe = entries.filter((e) => e.status === "dedupe");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Add your bill</h1>
        <p className="text-sm text-neutral-500">
          Photograph every page, or drop a PDF. JPEG, PNG, or PDF — up to 20MB
          each. We read it, we never share it.
        </p>
      </header>

      <div className="flex gap-3">
        <input
          ref={cameraRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="flex-1 rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Take photos
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex-1 rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
        >
          Choose files
        </button>
      </div>

      {entries.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800"
            >
              <span className="truncate">{e.name}</span>
              <span className="shrink-0 text-xs text-neutral-500">
                {e.status === "uploading" && "Reading…"}
                {e.status === "done" && "Bill ✓"}
                {e.status === "rejected" && `Looks like: ${e.response?.kind ?? "?"}`}
                {e.status === "dedupe" && "Looks familiar…"}
                {e.status === "failed" &&
                  (ERROR_COPY[e.errorCode ?? ""] ?? "Something went wrong — try again.")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {pendingDedupe.map((e) => (
        <div
          key={e.id}
          className="flex flex-col gap-3 rounded-lg border border-blue-300 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950"
        >
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            This looks like a bill you’ve already checked
            {e.response?.byteIdentical ? " — in fact, the exact same file" : ""}.
          </p>
          <p className="text-sm text-blue-900/90 dark:text-blue-100/90">
            Same provider, account number, and date of service as an existing
            case. A newer statement for that case? Continue there and we’ll
            track it as a new version.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void resolveDedupe(e, true)}
              className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white"
            >
              Continue existing case
            </button>
            <button
              type="button"
              onClick={() => void resolveDedupe(e, false)}
              className="rounded-md border border-blue-400 px-3 py-2 text-sm font-medium text-blue-900 dark:text-blue-100"
            >
              No, it’s a different bill
            </button>
          </div>
        </div>
      ))}

      {showKindReject && firstClassified?.response ? (
        <RejectPanel kind={firstClassified.response.kind} />
      ) : null}
      {qualityIssue?.response ? <QualityPanel quality={qualityIssue.response.quality} /> : null}

      {hasBill && caseId ? (
        <a
          href={`/case/${caseId}/confirm`}
          className="rounded-md bg-emerald-700 px-4 py-3 text-center text-sm font-medium text-white"
        >
          Looks good — review what we read
        </a>
      ) : null}
    </main>
  );
}
