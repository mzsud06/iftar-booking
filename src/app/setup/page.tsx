"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { errorText, supabase, type Side } from "@/lib/supabase";
import { Button, Card, Field, Notice, PageTitle, Spinner, inputCls } from "@/components/ui";

export default function SetupPage() {
  const { ready, session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [side, setSide] = useState<Side | null>(null);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace("/login");
    else if (profile) router.replace("/");
  }, [ready, session, profile, router]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!side) return setError("Please choose brothers or sisters.");
    setBusy(true);
    setError(null);
    const { error } = await supabase().rpc("create_profile", { p_full_name: name, p_side: side });
    if (error) {
      setBusy(false);
      return setError(errorText(error));
    }
    await refreshProfile();
    router.replace("/");
  }

  if (!ready || !session || profile) return <Spinner />;

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <PageTitle kicker="One-time setup" title="About you">
        You only do this once. Your name is shown to the door team when your ticket is scanned.
      </PageTitle>
      <Card className="p-6">
        <form onSubmit={save} className="space-y-5">
          <Field label="Full name">
            <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)}
              className={inputCls} autoComplete="name" placeholder="First and last name" />
          </Field>
          <fieldset>
            <legend className="text-sm font-medium mb-1.5">Seating</legend>
            <div className="grid grid-cols-2 gap-3">
              {(["brothers", "sisters"] as Side[]).map((s) => (
                <button type="button" key={s} onClick={() => setSide(s)}
                  className={`rounded-xl border px-4 py-3.5 capitalize font-medium transition ${
                    side === s ? "border-emerald-800 bg-emerald-900 text-ivory" : "border-line bg-white hover:border-emerald-700"}`}>
                  {s}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted mt-1.5">Only an admin can change this later.</p>
          </fieldset>
          <label className="flex gap-3 items-start text-sm">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 w-4 h-4 accent-emerald-800" />
            <span>I've read the <a href="/rules" target="_blank" className="underline underline-offset-4">rules and privacy notice</a>, including the strike rule for missed bookings.</span>
          </label>
          <Button type="submit" busy={busy} disabled={!agree || name.trim().length < 2 || !side} className="w-full">Save</Button>
        </form>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      </Card>
    </div>
  );
}
