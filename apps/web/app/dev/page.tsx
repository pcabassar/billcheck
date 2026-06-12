"use client";

import { useState } from "react";

/**
 * DEV-ONLY driver page: one-click login as the flagged test account, then
 * into the flow. The backing API route is hard-disabled outside development,
 * so this page is inert in production (the button just gets a 404).
 */
export default function DevPage() {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
        billcheck · dev driver
      </p>
      <button
        type="button"
        onClick={async () => {
          setMsg("logging in…");
          const r = await fetch("/api/auth/dev-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: "demo@billcheck.test",
              password: "demo-billcheck-2026!",
            }),
          });
          if (r.ok) window.location.href = "/upload";
          else setMsg(`login failed (${r.status}) — dev only`);
        }}
        className="rounded-md bg-neutral-900 px-6 py-3 text-base font-semibold text-white dark:bg-white dark:text-black"
      >
        Log in as test user → upload a bill
      </button>
      {msg ? <p className="text-sm text-neutral-500">{msg}</p> : null}
      <a href="/bills" className="text-sm text-neutral-500 underline">
        or go to your bills
      </a>
    </main>
  );
}
