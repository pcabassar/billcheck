// Resend wrapper for the smart-reminder email. Reads RESEND_API_KEY LAZILY (never throws at
// import) so the app/build degrade gracefully when email isn't configured — the demo still
// runs, the reminder just records a clean failure instead of crashing.
//
// Idempotency: the caller passes a stable key (`${caseId}:${deadlineId}:${branch}`); Resend
// honors it via the `Idempotency-Key` header, so a retried/duplicate branch won't double-send.
import { Resend } from 'resend'

// Default sender is a placeholder — set REMINDER_FROM to a verified Resend domain in prod.
const DEFAULT_FROM = 'billcheck <reminders@billcheck.example>'

export async function sendReminderEmail(input: {
  to: string
  subject: string
  html: string
  idempotencyKey: string
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY missing' }
  }

  const from = process.env.REMINDER_FROM ?? DEFAULT_FROM

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send(
      {
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      },
      { idempotencyKey: input.idempotencyKey },
    )

    if (error) {
      return { ok: false, error: error.message ?? 'Resend send failed' }
    }
    if (!data) {
      return { ok: false, error: 'Resend returned no data' }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown email error' }
  }
}
