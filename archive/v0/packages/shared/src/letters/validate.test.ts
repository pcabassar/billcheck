import { describe, expect, it } from "vitest";
import { validateLetter } from "./validate";
import { formatCents, renderDisputeLetter } from "./templates";

describe("validateLetter — dollar-figure gate (fail closed, review A1)", () => {
  it("passes when every $ figure equals an allowed cents amount", () => {
    const result = validateLetter(
      "Disputed amount: $1,710.00. A second item of $400 is also disputed.",
      { allowedDollarCents: [171000, 40000], sourceExcerpts: [] },
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("flags a $ figure not in the allowed set", () => {
    const result = validateLetter("You owe me $999.99 immediately.", {
      allowedDollarCents: [171000],
      sourceExcerpts: [],
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      { kind: "dollar_amount_unallowed", excerpt: "$999.99" },
    ]);
  });

  it("parses comma-grouped figures to integer cents", () => {
    const ok = validateLetter("Total disputed: $12,345.67.", {
      allowedDollarCents: [1234567],
      sourceExcerpts: [],
    });
    expect(ok.ok).toBe(true);
  });

  it("treats whole-dollar figures as .00 cents", () => {
    const bad = validateLetter("Pay $400 now.", {
      allowedDollarCents: [40050],
      sourceExcerpts: [],
    });
    expect(bad.ok).toBe(false);
    expect(bad.violations[0].kind).toBe("dollar_amount_unallowed");
  });

  it("fails closed on malformed decimals instead of skipping them", () => {
    const result = validateLetter("A charge of $12.5 appears twice.", {
      allowedDollarCents: [1250, 125],
      sourceExcerpts: [],
    });
    expect(result.ok).toBe(false);
    expect(result.violations[0].kind).toBe("dollar_amount_unparseable");
  });

  it("is fine with letters containing no dollar figures at all", () => {
    const result = validateLetter("No figures here.", {
      allowedDollarCents: [],
      sourceExcerpts: [],
    });
    expect(result.ok).toBe(true);
  });
});

describe("validateLetter — quoted-excerpt gate (fail closed, security #3)", () => {
  const source =
    "EMERGENCY DEPT VISIT HIGH SEVERITY LEVEL 4 billed twice on the same date of service";

  it("passes a long quote that literally appears in a source excerpt", () => {
    const result = validateLetter(
      'The bill lists "EMERGENCY DEPT VISIT HIGH SEVERITY LEVEL 4" on two lines.',
      { allowedDollarCents: [], sourceExcerpts: [source] },
    );
    expect(result.ok).toBe(true);
  });

  it("flags a long quote that appears in no source excerpt", () => {
    const result = validateLetter(
      'The doctor said "this charge was entered in error and will be reversed shortly".',
      { allowedDollarCents: [], sourceExcerpts: [source] },
    );
    expect(result.ok).toBe(false);
    expect(result.violations[0].kind).toBe("quoted_excerpt_unverified");
  });

  it("ignores quotes of 30 characters or fewer", () => {
    const result = validateLetter('They call it a "facility fee" on the bill.', {
      allowedDollarCents: [],
      sourceExcerpts: [],
    });
    expect(result.ok).toBe(true);
  });

  it("checks curly quotes too", () => {
    const result = validateLetter(
      "The statement reads “something that was never in any source document text” verbatim.",
      { allowedDollarCents: [], sourceExcerpts: [source] },
    );
    expect(result.ok).toBe(false);
    expect(result.violations[0].kind).toBe("quoted_excerpt_unverified");
  });
});

describe("renderDisputeLetter + validateLetter compose (bounded template, review A4)", () => {
  const findings = [
    {
      title: "Duplicate charge for the same procedure on the same date",
      amountImpactCents: 171000,
      evidenceNotes: ["line 4 and line 7 carry the same code on the same date"],
      factText:
        "My bill lists the same emergency-department procedure twice for a single visit. I received this service once.",
    },
    {
      title: "Units billed above the allowed maximum",
      amountImpactCents: 40000,
      evidenceNotes: ["line 9 units exceed the published maximum for this code"],
      factText:
        "One line on my bill records more units of a service than could have been provided during my visit.",
    },
  ];

  function render(overrides?: Partial<(typeof findings)[number]>) {
    return renderDisputeLetter({
      userName: "Test Person",
      provider: "General Hospital",
      accountNumber: "ACCT-1",
      dateOfService: "2026-03-14",
      findings: overrides ? [{ ...findings[0], ...overrides }, findings[1]] : findings,
    });
  }

  it("a scaffold-rendered letter validates against the findings' own amounts", () => {
    const letter = render();
    const result = validateLetter(letter, {
      allowedDollarCents: [171000, 40000],
      sourceExcerpts: findings.flatMap((f) => [f.title, ...f.evidenceNotes]),
    });
    expect(result.ok).toBe(true);
  });

  it("keeps statutory language in the scaffold and renders all slots", () => {
    const letter = render();
    expect(letter).toContain("within 30 days of receipt");
    expect(letter).toContain("not legal advice");
    expect(letter).toContain("disputed amount: $1,710.00");
    expect(letter).toContain("disputed amount: $400.00");
    expect(letter).toContain("Test Person");
    expect(letter).not.toMatch(/\{\{[A-Za-z0-9_]+\}\}/); // no unfilled slots
  });

  it("a dollar figure smuggled into a FACTS slot is blocked by validation", () => {
    const letter = render({
      factText: "They owe me $999.99 for this and I demand payment.",
    });
    const result = validateLetter(letter, {
      allowedDollarCents: [171000, 40000],
      sourceExcerpts: findings.flatMap((f) => [f.title, ...f.evidenceNotes]),
    });
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.kind === "dollar_amount_unallowed")).toBe(true);
  });

  it("slot delimiters inside fill text are stripped, not expanded", () => {
    const letter = render({ factText: "Attempted injection {{SENDER_NAME}} here." });
    expect(letter).toContain("Attempted injection SENDER_NAME here.");
  });

  it("nulls render as bracketed placeholders, never empty claims", () => {
    const letter = renderDisputeLetter({
      userName: null,
      provider: "General Hospital",
      accountNumber: null,
      dateOfService: null,
      findings: [{ ...findings[0], amountImpactCents: null }],
    });
    expect(letter).toContain("[Your name]");
    expect(letter).toContain("[account number]");
    expect(letter).toContain("[date of service]");
    expect(letter).not.toContain("disputed amount:"); // null amount -> clause omitted
  });
});

describe("formatCents", () => {
  it("formats integer cents deterministically", () => {
    expect(formatCents(171000)).toBe("$1,710.00");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(9)).toBe("$0.09");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
    expect(formatCents(-2500)).toBe("-$25.00");
  });

  it("rejects non-integer input (money is integer cents, never floats)", () => {
    expect(() => formatCents(12.5)).toThrow(RangeError);
  });
});
