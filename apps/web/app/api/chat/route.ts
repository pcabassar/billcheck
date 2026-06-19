// The chat endpoint. Runs the agent loop on the ONE guarded client and returns the
// turn's parts (cards already carry their values + source ids — provenance by
// construction). transportFromEnv() uses the real Anthropic model when
// ANTHROPIC_API_KEY is set, else the offline mock. No model numbers ever returned here.

// The chat endpoint. With a real key it runs the MODEL-DRIVEN loop (the model calls the
// audit tool and owns the card; we log model# vs tool#). Without a key it runs the
// deterministic mock pipeline — same path the offline harness uses. No model numbers are
// trusted blindly; the divergence log is the passive provenance signal.

import { GuardedClient, transportFromEnv } from "../../../src/core/model";
import { respond, type CaseInput } from "../../../src/core/agent";
import { respondWithModel } from "../../../src/core/agentModel";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let input: CaseInput;
  try {
    const body = await req.json();
    input = body?.input ?? { docs: [] };
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const turn = await respondWithModel(input);
      return Response.json({ parts: turn.parts, status: turn.status, model: process.env.BILLCHECK_MODEL ?? "claude-sonnet-4-6", divergence: turn.divergence });
    }
    const { transport, model } = transportFromEnv();
    const client = new GuardedClient({ transport, model, spendCapCents: 25, phaseOk: true });
    const turn = await respond(client, input);
    return Response.json({ parts: turn.parts, status: turn.status, model });
  } catch (e) {
    return Response.json({ error: (e as Error)?.name ?? "error" }, { status: 500 });
  }
}
