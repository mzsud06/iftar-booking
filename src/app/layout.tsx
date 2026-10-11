import type { Metadata, Viewport } from "next";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/700.css";
import "@fontsource-variable/inter";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "KCL ISoc Iftars",
  description: "Book your free spot at the KCL ISoc Ramadan iftars.",
};

export const viewport: Viewport = {
  themeColor: "#0e3a33",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh flex flex-col antialiased">
        <AuthProvider>
          <Header />
          <main className="flex-1 w-full">{children}</main>
          <footer className="no-print mt-20">
            <div className="mx-auto max-w-3xl px-6 py-8 text-xs uppercase tracking-[0.2em] text-muted flex justify-between">
              <span>KCL ISoc</span>
              <a href="/rules" className="hover:text-crimson-900">Rules</a>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
