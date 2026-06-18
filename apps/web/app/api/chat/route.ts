// The chat endpoint. Runs the agent loop on the ONE guarded client and returns the
// turn's parts (cards already carry their values + source ids — provenance by
// construction). transportFromEnv() uses the real Anthropic model when
// ANTHROPIC_API_KEY is set, else the offline mock. No model numbers ever returned here.

import { GuardedClient, transportFromEnv } from "../../../src/core/model";
import { respond, type CaseInput } from "../../../src/core/agent";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let input: CaseInput;
  try {
    const body = await req.json();
    input = body?.input ?? { docs: [] };
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const { transport, model } = transportFromEnv();
  const client = new GuardedClient({ transport, model, spendCapCents: 25, phaseOk: true });
  try {
    const turn = await respond(client, input);
    return Response.json({ parts: turn.parts, status: turn.status, model });
  } catch (e) {
    return Response.json({ error: (e as Error)?.name ?? "error" }, { status: 500 });
  }
}
