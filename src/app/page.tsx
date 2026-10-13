"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useServerNow } from "@/lib/auth";
import { errorText, place, supabase, type MyBooking, type Night, type NightCount } from "@/lib/supabase";
import { countdown, fmtDate, fmtDayLong, fmtTime, hoursBefore } from "@/lib/time";
import { Button, LinkButton, Spinner } from "@/components/ui";

export default function Home() {
  const { ready, session, profile } = useAuth();
  const now = useServerNow();
  const router = useRouter();
  const [nights, setNights] = useState<Night[] | null>(null);
  const [counts, setCounts] = useState<NightCount[]>([]);
  const [mine, setMine] = useState<MyBooking[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNights = useCallback(async () => {
    const since = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { data } = await supabase()
      .from("nights").select("*").eq("status", "scheduled")
      .gte("iftar_at", since).order("night_date").limit(14);
    setNights((data as Night[]) ?? []);
  }, []);

  useEffect(() => { loadNights(); }, [loadNights]);

  const next = useMemo(
    () => nights?.find((n) => new Date(n.iftar_at).getTime() + 2 * 3600_000 > now) ?? null,
    [nights, now],
  );
  const nextId = next?.id;

  const loadLive = useCallback(async () => {
    if (!nextId) return;
    const { data } = await supabase().rpc("night_counts", { p_night: nextId });
    setCounts((data as NightCount[]) ?? []);
    if (session && profile) {
      const { data: mb } = await supabase().rpc("my_bookings");
      setMine((mb as MyBooking[]) ?? []);
    }
  }, [nextId, session, profile]);

  useEffect(() => {
    loadLive();
    const t = setInterval(loadLive, 15000);
    return () => clearInterval(t);
  }, [loadLive]);

  async function book() {
    if (!next) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase().rpc("book_night", { p_night: next.id });
    setBusy(false);
    if (error) {
      setError(errorText(error));
      loadLive();
      return;
    }
    router.push("/ticket");
  }

  if (!nights || !ready || now === 0) return <Spinner />;

  const upcoming = nights.filter((n) => n.id !== next?.id && new Date(n.iftar_at).getTime() > now);

  return (
    <div>
      <section className="bg-crimson-900 text-ivory relative overflow-hidden">
        <div className="pattern pattern-fade absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-6 pt-14 pb-16">
          {next ? (
            <NextNight
              night={next} now={now} counts={counts}
              booking={mine.find((b) => b.night_id === next.id) ?? null}
              loggedIn={!!session} hasProfile={!!profile} side={profile?.side ?? null}
              banLeft={profile?.ban_nights_left ?? 0} busy={busy} onBook={book} error={error}
            />
          ) : (
            <>
              <p className="text-gold text-xs uppercase tracking-[0.25em] font-semibold">Ramadan iftars</p>
              <h1 className="font-display text-6xl font-bold mt-3 leading-none">Coming soon</h1>
            </>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-6">
        {upcoming.length > 0 && (
          <section className="mt-12">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-ink font-semibold">Next</p>
            <div className="rule mt-3" />
            {upcoming.map((n) => (
              <div key={n.id} className="flex items-baseline justify-between py-4 border-b border-line">
                <span>
                  <span className="font-display text-2xl font-semibold text-crimson-900">{fmtDate(n.iftar_at)}</span>
                  {n.campus && <span className="ml-3 text-sm text-muted">{n.campus}</span>}
                </span>
                <span className="text-sm text-muted">Opens {fmtDate(n.booking_opens_at)} {fmtTime(n.booking_opens_at)}</span>
              </div>
            ))}
          </section>
        )}

        <p className="mt-10 text-sm text-muted">
          Opens 6am the day before · One spot each · Missed bookings get strikes ·{" "}
          <a href="/rules" className="text-crimson-900 underline underline-offset-4 decoration-gold">Rules</a>
        </p>
      </div>
    </div>
  );
}

function NextNight(props: {
  night: Night; now: number; counts: NightCount[]; booking: MyBooking | null;
  loggedIn: boolean; hasProfile: boolean; side: "brothers" | "sisters" | null; banLeft: number;
  busy: boolean; onBook: () => void; error: string | null;
}) {
  const { night, now, counts, booking, loggedIn, hasProfile, side, banLeft, busy, onBook, error } = props;
  const opens = new Date(night.booking_opens_at).getTime();
  const iftar = new Date(night.iftar_at).getTime();
  const closes = hoursBefore(night.iftar_at, 3).getTime();
  const mySide = counts.find((c) => c.side === side);
  const full = mySide ? mySide.spots_left <= 0 || mySide.waitlisted > 0 : false;

  let action: React.ReactNode;
  if (now < opens) {
    action = (
      <div>
        <p className="text-ivory/60 text-sm">Opens in</p>
        <p className="font-display text-5xl font-bold tabular-nums text-gold">{countdown(opens - now)}</p>
        {!loggedIn && <LinkButton href="/login" variant="outline" className="mt-5 !text-ivory !border-ivory/40">Log in</LinkButton>}
        {loggedIn && !hasProfile && <LinkButton href="/setup" variant="gold" className="mt-5">Finish setup</LinkButton>}
      </div>
    );
  } else if (now < closes) {
    if (booking) {
      action = (
        <LinkButton href="/ticket" variant="gold">
          {booking.status === "confirmed" ? "View ticket" : booking.status === "offered" ? "Confirm your spot" : `Waitlist #${booking.waitlist_position}`}
        </LinkButton>
      );
    } else if (!loggedIn) {
      action = <LinkButton href="/login" variant="gold">Log in to book</LinkButton>;
    } else if (!hasProfile) {
      action = <LinkButton href="/setup" variant="gold">Finish setup</LinkButton>;
    } else if (banLeft > 0) {
      action = <p className="text-gold-soft">Blocked for {banLeft >= 1000 ? "the rest of Ramadan" : `${banLeft} more iftar${banLeft > 1 ? "s" : ""}`}.</p>;
    } else {
      action = (
        <Button variant="gold" onClick={onBook} busy={busy} className="text-base px-10 py-4">
          {full ? "Join waitlist" : "Book"}
        </Button>
      );
    }
  } else {
    action = booking?.status === "confirmed"
      ? <LinkButton href="/ticket" variant="gold">View ticket</LinkButton>
      : <p className="text-gold-soft">Booking closed · Walk-ins from {fmtTime(night.iftar_at)}</p>;
  }

  return (
    <div>
      <p className="text-gold text-xs uppercase tracking-[0.25em] font-semibold">Next iftar</p>
      <h1 className="font-display text-6xl sm:text-7xl font-bold mt-3 leading-[0.95]">{fmtDayLong(night.iftar_at)}</h1>
      <p className="mt-4 text-ivory/80 text-lg">
        {fmtTime(night.iftar_at)}{place(night) ? ` · ${place(night)}` : ""}
      </p>

      {counts.length > 0 && now < iftar + 2 * 3600_000 && (
        <div className="flex gap-10 mt-8">
          {counts.filter((c) => !side || c.side === side).map((c) => (
            <div key={c.side}>
              <p className="font-display text-4xl font-bold tabular-nums text-gold">{c.spots_left}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-ivory/60">{c.side} left</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10">{action}</div>
      {error && <p role="alert" className="mt-4 text-gold-soft border-l-2 border-gold pl-3">{error}</p>}
    </div>
  );
}
