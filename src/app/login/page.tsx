"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { errorText, supabase } from "@/lib/supabase";
import { Button, Card, Field, Notice, PageTitle, inputCls } from "@/components/ui";

export default function LoginPage() {
  const { ready, session, profile } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && session) router.replace(profile ? "/ticket" : "/setup");
  }, [ready, session, profile, router]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setError(errorText(error));
    else setSent(true);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError("That code didn't work. Check it, or request a new one.");
  }

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <PageTitle kicker="Welcome" title="Log in or sign up">
        No password needed. We'll email you a link and a code.
      </PageTitle>
      <Card className="p-6">
        {!sent ? (
          <form onSubmit={sendCode} className="space-y-4">
            <Field label="Email address">
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="you@example.com"
              />
            </Field>
            <Button type="submit" busy={busy} className="w-full">Email me a login link</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <Notice tone="success">
              Check <strong>{email}</strong>. Tap the link in the email, or type the code from it below.
            </Notice>
            <Field label="Code from the email" hint="If the email has no code, just tap the link instead.">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className={`${inputCls} tracking-[0.4em] text-center text-xl`}
                placeholder="••••••"
              />
            </Field>
            <Button type="submit" busy={busy} disabled={code.length < 6} className="w-full">Log in</Button>
            <button type="button" onClick={() => { setSent(false); setCode(""); }} className="w-full text-sm text-muted underline underline-offset-4">
              Use a different email
            </button>
          </form>
        )}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      </Card>
      <p className="text-xs text-muted mt-4">
        Can't find the email? Check your spam folder. It can take a minute to arrive.
      </p>
    </div>
  );
}
