"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "ghost" | "danger" | "outline";
  busy?: boolean;
};

const variants: Record<NonNullable<BtnProps["variant"]>, string> = {
  primary: "bg-crimson-900 text-ivory hover:bg-crimson-800",
  gold: "bg-gold text-crimson-950 hover:brightness-105",
  ghost: "text-crimson-900 underline underline-offset-4 decoration-gold hover:text-crimson-700",
  danger: "text-danger underline underline-offset-4 hover:text-crimson-700",
  outline: "text-crimson-900 border border-crimson-900/30 hover:border-crimson-900",
};

const shape = "inline-flex items-center justify-center gap-2 px-6 py-3 text-[15px] font-medium tracking-wide transition disabled:opacity-40 disabled:cursor-not-allowed";

export function Button({ variant = "primary", busy, className = "", children, disabled, ...rest }: BtnProps) {
  return (
    <button {...rest} disabled={disabled || busy} className={`${shape} ${variants[variant]} ${className}`}>
      {busy && <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary", className = "" }:
  { href: string; children: React.ReactNode; variant?: BtnProps["variant"]; className?: string }) {
  return <Link href={href} className={`${shape} ${variants[variant ?? "primary"]} ${className}`}>{children}</Link>;
}

// Kept for structure only: no border, no background, no rounding.
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warn"; children: React.ReactNode }) {
  const tones = {
    info: "border-gold text-ink",
    error: "border-danger text-danger",
    success: "border-crimson-800 text-crimson-900",
    warn: "border-warn text-[#6e4510]",
  };
  return <div role={tone === "error" ? "alert" : undefined} className={`border-l-2 pl-4 py-1 text-[15px] ${tones[tone]}`}>{children}</div>;
}

export function PageTitle({ kicker, title, children }: { kicker?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8">
      {kicker && <p className="text-xs uppercase tracking-[0.2em] text-gold-ink font-semibold mb-2">{kicker}</p>}
      <h1 className="font-display text-5xl font-bold leading-none text-crimson-900">{title}</h1>
      {children && <div className="mt-3 text-muted">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.15em] text-muted mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full bg-transparent border-0 border-b border-crimson-900/30 px-0 py-2.5 text-[17px] outline-none focus:border-crimson-900 placeholder:text-muted/60";

// Spinner that admits defeat: after 12 seconds it says the connection failed.
export function Spinner() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <span className="w-6 h-6 rounded-full border-2 border-crimson-800 border-t-transparent animate-spin" />
      {slow && (
        <div className="text-center text-sm text-muted">
          <p>Can't connect. Check your signal.</p>
          <button onClick={() => window.location.reload()} className="mt-2 text-crimson-900 underline underline-offset-4 decoration-gold">Try again</button>
        </div>
      )}
    </div>
  );
}
