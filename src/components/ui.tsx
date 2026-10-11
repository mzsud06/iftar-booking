"use client";

import Link from "next/link";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "ghost" | "danger" | "outline";
  busy?: boolean;
};

const variants: Record<NonNullable<BtnProps["variant"]>, string> = {
  primary: "bg-emerald-900 text-ivory hover:bg-emerald-800",
  gold: "bg-gold text-emerald-950 hover:brightness-105",
  ghost: "text-emerald-900 hover:bg-sand",
  danger: "bg-white text-danger border border-danger/40 hover:bg-danger/5",
  outline: "bg-white text-emerald-900 border border-line hover:border-emerald-700",
};

export function Button({ variant = "primary", busy, className = "", children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {busy && <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = "primary", className = "" }:
  { href: string; children: React.ReactNode; variant?: BtnProps["variant"]; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-full px-5 py-3 text-[15px] font-medium transition ${variants[variant ?? "primary"]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-line shadow-[0_1px_0_rgba(0,0,0,0.02)] ${className}`}>{children}</div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warn"; children: React.ReactNode }) {
  const tones = {
    info: "bg-sand border-line text-ink",
    error: "bg-danger/5 border-danger/30 text-danger",
    success: "bg-emerald-800/5 border-emerald-700/30 text-emerald-900",
    warn: "bg-warn/10 border-warn/30 text-[#7a4f12]",
  };
  return <div role={tone === "error" ? "alert" : undefined} className={`rounded-xl border px-4 py-3 text-[15px] ${tones[tone]}`}>{children}</div>;
}

export function PageTitle({ kicker, title, children }: { kicker?: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      {kicker && <p className="text-xs uppercase tracking-[0.18em] text-gold font-semibold mb-2">{kicker}</p>}
      <h1 className="font-display text-4xl font-bold leading-tight">{title}</h1>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-line bg-white px-4 py-3 text-[16px] outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15";

export function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <span className="w-6 h-6 rounded-full border-2 border-emerald-800 border-t-transparent animate-spin" />
    </div>
  );
}
