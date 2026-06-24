import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "billcheck",
  description: "A chat-first medical-bill advisor",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // resize layout when the mobile keyboard opens (avoids the composer hiding behind it)
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
