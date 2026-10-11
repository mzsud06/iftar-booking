"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import Star from "./Star";

export default function Header() {
  const { session, profile, signOut } = useAuth();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const links: { href: string; label: string }[] = [{ href: "/", label: "Iftars" }];
  if (session) links.push({ href: "/ticket", label: "My ticket" });
  links.push({ href: "/rules", label: "Rules" });
  if (profile && (profile.role === "volunteer" || profile.role === "admin")) links.push({ href: "/scan", label: "Scan" });
  if (profile?.role === "admin") links.push({ href: "/admin", label: "Admin" });

  return (
    <header className="bg-emerald-900 text-ivory relative overflow-hidden">
      <div className="pattern absolute inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-5 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <Star className="w-6 h-6 text-gold" />
          <span className="font-display text-2xl font-semibold leading-none">KCL ISoc Iftars</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2 rounded-full transition ${
                path === l.href ? "bg-emerald-800 text-ivory" : "text-ivory/80 hover:text-ivory"
              }`}
            >
              {l.label}
            </Link>
          ))}
          {session ? (
            <button onClick={signOut} className="ml-2 px-3 py-2 text-ivory/70 hover:text-ivory">Log out</button>
          ) : (
            <Link href="/login" className="ml-2 px-4 py-2 rounded-full bg-gold text-emerald-950 font-medium">Log in</Link>
          )}
        </nav>

        <button
          className="sm:hidden p-2 -mr-2"
          aria-label="Menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav className="sm:hidden relative border-t border-emerald-800 px-5 py-3 flex flex-col text-base">
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="py-2.5 text-ivory/90">
              {l.label}
            </Link>
          ))}
          {session ? (
            <button onClick={() => { setOpen(false); signOut(); }} className="py-2.5 text-left text-ivory/70">Log out</button>
          ) : (
            <Link href="/login" onClick={() => setOpen(false)} className="py-2.5 text-gold font-medium">Log in</Link>
          )}
        </nav>
      )}
    </header>
  );
}
