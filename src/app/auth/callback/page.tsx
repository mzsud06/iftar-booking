"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LinkButton, Notice, Spinner } from "@/components/ui";

// The email link lands here. Supabase reads the login from the address bar.
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabase();
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const err = params.get("error_description") || hash.get("error_description");
    if (err) {
      setError(err.replace(/\+/g, " "));
      return;
    }

    let done = false;
    async function finish() {
      const code = params.get("code");
      if (code) await sb.auth.exchangeCodeForSession(code).catch(() => null);
      const { data } = await sb.auth.getSession();
      if (!data.session) return false;
      const { data: profile } = await sb.from("profiles").select("id").eq("id", data.session.user.id).maybeSingle();
      done = true;
      router.replace(profile ? "/ticket" : "/setup");
      return true;
    }

    finish();
    const { data: sub } = sb.auth.onAuthStateChange(() => { if (!done) finish(); });
    const t = setTimeout(() => {
      if (!done) setError("This login link has expired or was already used. Please request a new one.");
    }, 8000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [router]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-5 py-12 space-y-4">
        <Notice tone="error">{error}</Notice>
        <LinkButton href="/login">Back to log in</LinkButton>
      </div>
    );
  }
  return <Spinner />;
}
