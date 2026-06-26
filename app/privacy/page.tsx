// /privacy — a plain-language consumer-health privacy policy (U12).
//
// PUBLIC + static: reachable signed-out (allow-listed in lib/supabase/middleware.ts) because
// Washington's My Health My Data Act (MHMDA, no business-size threshold) requires the privacy
// policy be available before/without an account. Honest, readable, clearly a v1 draft — not legal
// advice. Mirrors the product's real behavior: per-account storage you can delete, a separate
// opt-in (default OFF) anonymized-aggregate tier whose contributions can't be retracted, and the
// fact that billcheck is information, not legal/medical advice, and is not a HIPAA covered entity.
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — billcheck',
  description: 'How billcheck handles the health and billing information you share.',
}

const UPDATED = 'June 2026'

export default function PrivacyPage() {
  return (
    <main className="legal">
      <p className="legal-back">
        <Link href="/login">← Back to billcheck</Link>
      </p>

      <h1>Privacy Policy</h1>
      <p className="legal-meta">
        Last updated: {UPDATED} · This is an early (v1) draft and may change as billcheck grows.
      </p>

      <p>
        billcheck helps you understand and respond to medical bills. To do that, you share
        sensitive information with us — bills, insurance documents, and details about your
        situation. This page explains, in plain language, what we collect, how we store it, what
        choices you have, and what billcheck is and isn&apos;t.
      </p>

      <h2>What we collect</h2>
      <p>We only collect what you give us in order to help with your case:</p>
      <ul>
        <li>
          <strong>The documents you share</strong> — photos or PDFs of bills, statements,
          Explanations of Benefits (EOBs), and any other files you upload.
        </li>
        <li>
          <strong>What you tell us</strong> — your messages, and the facts about your situation you
          choose to save (for example, your coverage type, your state, and notes you add).
        </li>
        <li>
          <strong>Things billcheck creates with you</strong> — draft letters and call scripts,
          deadlines and reminders, and a timeline of activity on your case.
        </li>
        <li>
          <strong>Account basics</strong> — the email address you sign up with.
        </li>
      </ul>

      <h2>How we store it and who can see it</h2>
      <p>
        Your information is stored privately, tied to your account. It is isolated so that other
        users cannot see it. We use it to provide billcheck&apos;s features to you — explaining your
        bill, drafting documents, and tracking your deadlines. We do not sell your personal
        information, and we do not use your personal case data for advertising.
      </p>
      <p>
        Reminder emails we send you contain only what&apos;s needed to nudge you about a deadline —
        not your bill amounts or document contents.
      </p>

      <h2>You can delete your data</h2>
      <p>
        You can permanently delete your account and all of its personal data at any time, from the
        case workspace (&ldquo;Delete account &amp; data&rdquo;). This removes your cases, the
        documents you shared, your saved situation, your letters, your deadlines, and your chat
        history, and cancels any pending reminders. Deletion can&apos;t be undone.
      </p>

      <h2>The optional, anonymized data tier (off by default)</h2>
      <p>
        Separately, you can <strong>opt in</strong> to contribute <strong>anonymized,
        de-identified</strong> information about a resolved bill — to help build a picture of how
        medical billing problems play out and get fixed. This is{' '}
        <strong>off by default</strong>. Nothing is contributed unless you turn it on.
      </p>
      <p>When it&apos;s on, contributed records are stripped of anything that could identify you:</p>
      <ul>
        <li>no names, account numbers, member IDs, or contact details;</li>
        <li>no exact dollar amounts (we use broad ranges) and no exact dates (year only);</li>
        <li>location no more precise than your state;</li>
        <li>no free-text from your documents or messages.</li>
      </ul>
      <p>
        These records are stored <strong>separately</strong> from your personal account, with no
        link back to you. Because of that separation, <strong>contributed anonymized records
        can&apos;t be retracted</strong> — if you later delete your account or turn the setting off,
        we sever any pointer on your side, but the de-identified records that were already
        contributed remain. We tell you this clearly before you opt in.
      </p>

      <h2>billcheck is information, not advice</h2>
      <p>
        billcheck provides general information to help you understand and respond to medical bills.
        It is <strong>not legal advice and not medical advice</strong>, and using it does not create
        an attorney-client or any professional relationship. For decisions with significant legal,
        financial, or health consequences, consider consulting a qualified professional.
      </p>

      <h2>Your consumer-health privacy rights</h2>
      <p>
        We treat the bills and health-related information you share as sensitive consumer-health
        data. We aim to honor the protections of Washington&apos;s My Health My Data Act (MHMDA) and
        similar consumer-health and health-breach-notification rules: a clear privacy policy,
        separate and explicit consent for the optional anonymized tier, and the ability to delete
        your data.
      </p>
      <p>
        billcheck is <strong>not a HIPAA covered entity</strong> and is not your insurer, provider,
        or a clearinghouse. The privacy rules that apply to us are general consumer-protection and
        consumer-health rules, not HIPAA.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        As billcheck develops, we may update this policy. This is an early draft and we&apos;ll keep
        it honest and current as the product changes.
      </p>

      <p className="legal-back">
        <Link href="/login">← Back to billcheck</Link>
      </p>
    </main>
  )
}
