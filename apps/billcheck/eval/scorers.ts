// Deterministic scorers (no LLM judge). These are the future CI gates, run here
// as a report. Two are "never-events": a false-OK ("pay it" when it isn't) and a
// provenance violation (a number not traceable to a fact).

import type { AgentTurn, VerdictCard, VerdictKind, Sourced } from "../src/core/types.ts";
import type { Persona } from "./personas.ts";

export interface Score {
  id: string;
  expect: VerdictKind;
  got: VerdictKind | "none";
  verdictOk: boolean;
  provenanceOk: boolean;
  provenanceErr?: string;
  falseOK: boolean; // predicted "ok" (pay) when truth is not ok — the dangerous error
}

function verdictCardOf(turn: AgentTurn): VerdictCard | undefined {
  for (const p of turn.parts) if (p.type === "card" && p.card.type === "verdict") return p.card;
  return undefined;
}

function checkProvenance(turn: AgentTurn): { ok: boolean; err?: string } {
  // 1) no dollar figure may appear in conversational prose.
  for (const p of turn.parts) {
    if (p.type === "text" && /\$\s*\d/.test(p.text)) return { ok: false, err: "dollar figure in prose" };
  }
  // 2) every sourced number in every card must resolve to a fact, and match its value.
  const amts = turn.facts.amounts;
  for (const p of turn.parts) {
    if (p.type !== "card" || p.card.type !== "verdict" || !p.card.amounts) continue;
    const sourced: Sourced[] = [...p.card.amounts.rows];
    if (p.card.amounts.total) sourced.push(p.card.amounts.total);
    for (const s of sourced) {
      if (!(s.src in amts)) return { ok: false, err: `unsourced figure: ${s.label} (${s.src})` };
      if (amts[s.src] !== s.cents) return { ok: false, err: `mismatch: ${s.label} ${s.cents}≠fact ${amts[s.src]}` };
    }
  }
  return { ok: true };
}

export function scoreTurn(turn: AgentTurn, persona: Persona): Score {
  const card = verdictCardOf(turn);
  const got = card?.verdict ?? "none";
  const prov = checkProvenance(turn);
  return {
    id: persona.id,
    expect: persona.expect,
    got,
    verdictOk: got === persona.expect,
    provenanceOk: prov.ok,
    provenanceErr: prov.err,
    falseOK: got === "ok" && persona.expect !== "ok",
  };
}
