import ChatClient from "./chat-client";

// Thin server component. The page gate (proxy.ts) handles auth redirects; the client
// component resumes the active case via GET /api/cases/active on mount.
export default function Home() {
  return <ChatClient />;
}
