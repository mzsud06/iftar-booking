"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useServerNow } from "@/lib/auth";
import { errorText, supabase, type MyBooking, type Night, type NightCount } from "@/lib/supabase";
import { countdown, fmtDate, fmtDayLong, fmtTime, hoursBefore } from "@/lib/time";
import { Button, Card, LinkButton, Notice, Spinner } from "@/components/ui";
import Star from "@/components/Star";

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
      .from("nights")
      .select("*")
      .eq("status", "scheduled")
      .gte("iftar_at", since)
      .order("night_date")
      .limit(14);
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
      <section className="bg-emerald-900 text-ivory relative overflow-hidden">
        <div className="pattern absolute inset-0 opacity-40" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5 pt-10 pb-24">
          <p className="font-display text-gold text-2xl" lang="ar" dir="rtl">رمضان كريم</p>
          <h1 className="font-display text-5xl sm:text-6xl font-bold leading-[1.02] mt-2">
            Free iftars, every evening.
          </h1>
          <p className="mt-4 text-ivory/80 max-w-xl text-[17px]">
            Book your spot from 6am the day before, show your QR code at the door, and break your fast with the KCL community.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-5 -mt-16 relative">
        {next ? (
          <NextNightCard
            night={next}
            now={now}
            counts={counts}
            booking={mine.find((b) => b.night_id === next.id) ?? null}
            loggedIn={!!session}
            hasProfile={!!profile}
            side={profile?.side ?? null}
            banLeft={profile?.ban_nights_left ?? 0}
            busy={busy}
            onBook={book}
            error={error}
          />
        ) : (
          <Card className="p-6 sm:p-8">
            <h2 className="font-display text-3xl font-bold">No iftars scheduled yet</h2>
            <p className="mt-2 text-muted">Dates will appear here once the ISoc announces them. Check back closer to Ramadan.</p>
          </Card>
        )}

        {upcoming.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold mb-3">Coming up</h2>
            <Card className="divide-y divide-line">
              {upcoming.map((n) => (
                <div key={n.id} className="flex items-center justify-between px-5 py-4 gap-4">
                  <div>
                    <p className="font-medium">{fmtDate(n.iftar_at)}</p>
                    <p className="text-sm text-muted">Iftar {fmtTime(n.iftar_at)}{n.room ? ` · ${n.room}` : ""}</p>
                  </div>
                  <p className="text-sm text-right text-muted">
                    Booking opens<br />
                    <span className="text-ink font-medium">{fmtDate(n.booking_opens_at)}, {fmtTime(n.booking_opens_at)}</span>
                  </p>
                </div>
              ))}
            </Card>
          </section>
        )}

        <section className="mt-10 grid sm:grid-cols-3 gap-4">
          {[
            ["Book", "Booking opens at 6am the day before each iftar. One spot per person."],
            ["Show your QR", "Your ticket appears straight away. Screenshot it or open it here at the door."],
            ["Can't make it?", "Cancel as early as you can so someone on the waitlist gets your spot."],
          ].map(([t, d], i) => (
            <Card key={t} className="p-5">
              <div className="flex items-center gap-2 text-gold">
                <Star className="w-4 h-4" />
                <span className="text-xs font-semibold tracking-[0.15em] uppercase">Step {i + 1}</span>
              </div>
              <h3 className="font-display text-2xl font-bold mt-2">{t}</h3>
              <p className="text-sm text-muted mt-1">{d}</p>
            </Card>
          ))}
        </section>
        <p className="mt-6 text-sm text-muted">
          Booked but not turning up stops someone else from eating. Two missed bookings block your next booking.{" "}
          <a href="/rules" className="underline underline-offset-4">Read the rules</a>.
        </p>
      </div>
    </div>
  );
}

function NextNightCard(props: {
  night: Night; now: number; counts: NightCount[]; booking: MyBooking | null;
  loggedIn: boolean; hasProfile: boolean; side: "brothers" | "sisters" | null; banLeft: number;
  busy: boolean; onBook: () => void; error: string | null;
}) {
  const { night, now, counts, booking, loggedIn, hasProfile, side, banLeft, busy, onBook, error } = props;
  const opens = new Date(night.booking_opens_at).getTime();
  const iftar = new Date(night.iftar_at).getTime();
  const closes = hoursBefore(night.iftar_at, 3).getTime();
  const mySide = counts.find((c) => c.side === side);
  const full = mySide ? mySide.spots_left <= 0 : false;

  let action: React.ReactNode = null;
  if (now < opens) {
    action = (
      <div>
        <p className="text-sm text-muted">Booking opens in</p>
        <p className="font-display text-4xl font-bold tabular-nums">{countdown(opens - now)}</p>
        <p className="text-sm text-muted mt-1">{fmtDate(night.booking_opens_at)} at {fmtTime(night.booking_opens_at)}</p>
        {!loggedIn && <LinkButton href="/login" variant="outline" className="mt-4">Log in now so you're ready</LinkButton>}
        {loggedIn && !hasProfile && <LinkButton href="/setup" className="mt-4">Finish setting up your account</LinkButton>}
      </div>
    );
  } else if (now < closes) {
    if (booking) {
      action = (
        <div>
          <Notice tone="success">
            {booking.status === "confirmed" && "You're booked in for this iftar."}
            {booking.status === "waitlisted" && `You're on the waitlist, number ${booking.waitlist_position}.`}
            {booking.status === "offered" && "A spot is waiting for you. Confirm it within the hour."}
          </Notice>
          <LinkButton href="/ticket" className="mt-4">{booking.status === "offered" ? "Confirm my spot" : "View my ticket"}</LinkButton>
        </div>
      );
    } else if (!loggedIn) {
      action = <LinkButton href="/login" variant="gold">Log in to book</LinkButton>;
    } else if (!hasProfile) {
      action = <LinkButton href="/setup">Finish setting up your account</LinkButton>;
    } else if (banLeft > 0) {
      action = (
        <Notice tone="warn">
          {banLeft >= 1000
            ? "You can't book more iftars this Ramadan because of missed bookings."
            : `You can't book right now because of missed bookings. You can book again after ${banLeft} more iftar night${banLeft > 1 ? "s" : ""}.`}
        </Notice>
      );
    } else {
      action = (
        <div>
          <Button variant="gold" onClick={onBook} busy={busy} className="w-full sm:w-auto text-base px-8 py-3.5">
            {full ? "Join the waitlist" : "Book my spot"}
          </Button>
          <p className="text-sm text-muted mt-2">Booking closes at {fmtTime(new Date(closes).toISOString())}.</p>
        </div>
      );
    }
  } else if (now < iftar) {
    action = booking?.status === "confirmed"
      ? <LinkButton href="/ticket">View my ticket</LinkButton>
      : <Notice>Booking has closed. Walk-ins are welcome from iftar time if there are spots left.</Notice>;
  } else {
    action = booking?.status === "confirmed"
      ? <LinkButton href="/ticket">View my ticket</LinkButton>
      : <Notice>Iftar has started. Walk-ins are let in while spots last.</Notice>;
  }

  return (
    <Card className="p-6 sm:p-8 shadow-xl shadow-emerald-950/10">
      <p className="text-xs uppercase tracking-[0.18em] text-gold font-semibold">Next iftar</p>
      <div className="flex flex-wrap items-end justify-between gap-4 mt-2">
        <div>
          <h2 className="font-display text-4xl font-bold leading-tight">{fmtDayLong(night.iftar_at)}</h2>
          <p className="text-muted mt-1">
            Iftar at <span className="text-ink font-medium">{fmtTime(night.iftar_at)}</span>
            {night.room ? <> · {night.room}</> : null}
            {" "}· Doors {fmtTime(new Date(iftar - 30 * 60_000).toISOString())}
          </p>
        </div>
      </div>

      {counts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 mt-5">
          {counts.map((c) => (
            <div key={c.side} className={`rounded-xl px-4 py-3 border ${c.side === side ? "border-emerald-700/40 bg-emerald-800/5" : "border-line bg-ivory"}`}>
              <p className="text-xs uppercase tracking-wider text-muted capitalize">{c.side}</p>
              <p className="font-display text-3xl font-bold tabular-nums">
                {c.spots_left}<span className="text-base text-muted font-sans font-normal"> / {c.capacity} left</span>
              </p>
              {c.waitlisted > 0 && <p className="text-xs text-muted">{c.waitlisted} on waitlist</p>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">{action}</div>
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
    </Card>
  );
}
