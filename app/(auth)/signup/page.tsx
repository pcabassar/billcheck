import { signup } from '../actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const sp = await searchParams
  return (
    <main style={wrap}>
      <div style={card}>
        <h1 style={{ margin: 0, fontSize: 22 }}>billcheck</h1>
        <p style={{ color: '#555', marginTop: 6 }}>Create an account — we&apos;ll remember your case.</p>
        {sp.error && <p style={err}>{sp.error}</p>}
        <form action={signup} style={form}>
          <input style={input} name="email" type="email" required placeholder="Email" autoComplete="email" />
          <input style={input} name="password" type="password" required minLength={8} placeholder="Password (8+ characters)" autoComplete="new-password" />
          <button style={button} type="submit">Create account</button>
        </form>
        <p style={{ fontSize: 14, marginTop: 14 }}>
          Already have an account? <a href="/login">Sign in</a>
        </p>
      </div>
    </main>
  )
}

const wrap: React.CSSProperties = { minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }
const card: React.CSSProperties = { width: '100%', maxWidth: 360, border: '1px solid #e5e5e5', borderRadius: 12, padding: 24 }
const form: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }
const input: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 15 }
const button: React.CSSProperties = { padding: '10px 12px', borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontSize: 15, cursor: 'pointer' }
const err: React.CSSProperties = { background: '#fdecec', color: '#a12622', padding: 8, borderRadius: 8, fontSize: 14 }
