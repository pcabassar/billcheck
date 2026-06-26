// Shared, dependency-free types for the smart-reminder Workflow.
//
// Lives in its own module so both the `'use workflow'` body (reminder.ts) and the `'use step'`
// functions (reminder-steps.ts) can import the input shape WITHOUT either importing the other
// (avoids a cycle) and WITHOUT pulling any Node-only deps into the flow VM bundle.

export type ReminderInput = {
  caseId: string
  deadlineId: string
  userId: string
  dueAtISO: string
  recipientEmail: string
}
