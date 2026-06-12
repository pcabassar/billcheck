export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-neutral-500">
        billcheck
      </p>
      <h1 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
        Is your medical bill correct?
      </h1>
      <p className="max-w-xl text-lg text-neutral-600 dark:text-neutral-300">
        Most hospital bills contain errors, inflated charges, or amounts you
        don&apos;t actually owe. billcheck reads your bill, runs it through
        deterministic checks, and tells you — with evidence — whether to pay it
        or fight it.
      </p>
      <p className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm text-neutral-500 dark:border-neutral-700">
        In development — launching soon
      </p>
      <footer className="mt-10 text-xs text-neutral-400">
        Healthcare should be fair, transparent, and cost-effective for all.
      </footer>
    </main>
  );
}
