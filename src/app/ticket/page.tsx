"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useAuth, useServerNow } from "@/lib/auth";
import { errorText, supabase, type MyBooking } from "@/lib/supabase";
import { countdown, fmtDayLong, fmtTime, hoursBefore, shortCode } from "@/lib/time";
import { Button, Card, LinkButton, Notice, PageTitle, Spinner } from "@/components/ui";
import Star from "@/components/Star";

export default function TicketPage() {
  const { ready, session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const now = useServerNow();
  const [items, setItems] = useState<MyBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc("my_bookings");
    if (error) setError(errorText(error));
    setItems((data as MyBooking[]) ?? []);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!session) { router.replace("/login"); return; }
    if (!profile) { router.replace("/setup"); return; }
    load();
    refreshProfile();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, session, profile?.id, load, router]);

  async function cancel(b: MyBooking) {
    const late = b.status === "confirmed" && !b.from_waitlist && now >= hoursBefore(b.iftar_at, 3).getTime();
    const msg = b.status === "confirmed"
      ? late
        ? "It's less than 3 hours before iftar, so this counts as a late cancel. Every third late cancel is a strike. Still cancel? It frees your spot for a walk-in."
        : "Cancel your booking? Your spot goes to the next person on the waitlist."
      : b.status === "offered"
        ? "Turn down this spot? It will go to the next person."
        : "Leave the waitlist?";
    if (!window.confirm(msg)) return;
    setBusyId(b.booking_id);
    setError(null);
    const { error } = await supabase().rpc("cancel_booking", { p_booking: b.booking_id });
    setBusyId(null);
    if (error) setError(errorText(error));
    await load();
    await refreshProfile();
  }

  async function confirmOffer(b: MyBooking) {
    setBusyId(b.booking_id);
    setError(null);
    const { error } = await supabase().rpc("confirm_offer", { p_booking: b.booking_id });
    setBusyId(null);
    if (error) setError(errorText(error));
    await load();
  }

  if (!ready || !profile || items === null) return <Spinner />;

  return (
    <div className="mx-auto max-w-md px-5 py-10">
      <PageTitle kicker={`Assalamu alaykum, ${profile.full_name.split(" ")[0]}`} title="My ticket" />

      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}

      {items.length === 0 && (
        <Card className="p-6">
          <p className="font-medium">You have no bookings right now.</p>
          <p className="text-muted text-sm mt-1">Booking for each iftar opens at 6am the day before.</p>
          <LinkButton href="/" className="mt-4">See upcoming iftars</LinkButton>
        </Card>
      )}

      <div className="space-y-6">
        {items.map((b) =>
          b.status === "confirmed" ? (
            <TicketCard key={b.booking_id} b={b} name={profile.full_name} now={now}
              onCancel={() => cancel(b)} busy={busyId === b.booking_id} />
          ) : b.status === "offered" ? (
            <Card key={b.booking_id} className="p-6 border-gold">
              <p className="text-xs uppercase tracking-[0.18em] text-gold font-semibold">A spot opened up</p>
              <h2 className="font-display text-3xl font-bold mt-1">{fmtDayLong(b.iftar_at)}</h2>
              <p className="text-muted">Iftar {fmtTime(b.iftar_at)}{b.room ? ` · ${b.room}` : ""}</p>
              {b.offer_expires_at && (
                <p className="mt-4 text-[15px]">
                  Confirm within <span className="font-semibold tabular-nums">{countdown(new Date(b.offer_expires_at).getTime() - now)}</span> or it goes to the next person.
                </p>
              )}
              <div className="flex gap-3 mt-4">
                <Button variant="gold" onClick={() => confirmOffer(b)} busy={busyId === b.booking_id} className="flex-1">Confirm my spot</Button>
                <Button variant="outline" onClick={() => cancel(b)} disabled={busyId === b.booking_id}>No thanks</Button>
              </div>
            </Card>
          ) : (
            <Card key={b.booking_id} className="p-6">
              <p className="text-xs uppercase tracking-[0.18em] text-muted font-semibold">Waitlist</p>
              <h2 className="font-display text-3xl font-bold mt-1">{fmtDayLong(b.iftar_at)}</h2>
              <p className="text-muted">Iftar {fmtTime(b.iftar_at)}</p>
              <p className="mt-4 font-display text-5xl font-bold">#{b.waitlist_position}</p>
              <p className="text-sm text-muted">in line. If a spot opens, you'll see it here and have 1 hour to confirm. The waitlist closes at {fmtTime(hoursBefore(b.iftar_at, 3).toISOString())}.</p>
              <Button variant="ghost" onClick={() => cancel(b)} busy={busyId === b.booking_id} className="mt-3 -ml-3">Leave the waitlist</Button>
            </Card>
          ),
        )}
      </div>

      <Card className="p-5 mt-8">
        <h3 className="font-medium">Your record</h3>
        <div className="flex items-center gap-2 mt-3">
          {[0, 1].map((i) => (
            <span key={i} className={`w-7 h-7 rounded-full border-2 ${i < profile.strikes ? "bg-danger border-danger" : "border-line"}`} />
          ))}
          <span className="ml-2 text-sm">Strikes: <strong>{profile.strikes} of 2</strong></span>
        </div>
        {profile.late_cancels % 3 > 0 && (
          <p className="text-sm text-muted mt-2">Late cancels: {profile.late_cancels % 3} of 3 (the third counts as a strike).</p>
        )}
        {profile.ban_nights_left > 0 && (
          <div className="mt-3"><Notice tone="warn">
            {profile.ban_nights_left >= 1000
              ? "You can't book more iftars this Ramadan because of missed bookings."
              : `You can book again after ${profile.ban_nights_left} more iftar night${profile.ban_nights_left > 1 ? "s" : ""}.`}
            {" "}If you think this is a mistake, contact the ISoc.
          </Notice></div>
        )}
        <p className="text-xs text-muted mt-3">Seating: <span className="capitalize">{profile.side}</span> · {profile.email}</p>
      </Card>
    </div>
  );
}

function TicketCard({ b, name, now, onCancel, busy }:
  { b: MyBooking; name: string; now: number; onCancel: () => void; busy: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(`IFTAR:${b.token}`, { width: 560, margin: 1, errorCorrectionLevel: "M", color: { dark: "#082622", light: "#ffffff" } })
      .then(setQr);
  }, [b.token]);

  const iftar = new Date(b.iftar_at).getTime();
  const canCancel = !b.checked_in_at && now < iftar;

  return (
    <div className="rounded-3xl overflow-hidden shadow-xl shadow-emerald-950/15">
      <div className="bg-emerald-900 text-ivory relative px-6 pt-6 pb-8">
        <div className="pattern absolute inset-0 opacity-50" aria-hidden />
        <div className="relative">
          <div className="flex items-center gap-2 text-gold">
            <Star className="w-4 h-4" />
            <span className="text-xs uppercase tracking-[0.2em] font-semibold">Iftar ticket</span>
          </div>
          <h2 className="font-display text-3xl font-bold mt-2">{fmtDayLong(b.iftar_at)}</h2>
          <p className="text-ivory/80">Iftar {fmtTime(b.iftar_at)} · Doors {fmtTime(new Date(iftar - 30 * 60_000).toISOString())}</p>
          {b.room && <p className="text-ivory/80">{b.room}</p>}
        </div>
      </div>
      <div className="bg-white px-6 pb-6 -mt-4 rounded-t-3xl relative">
        <div className="pt-6 flex flex-col items-center">
          {b.checked_in_at ? (
            <div className="w-64 h-64 rounded-2xl bg-emerald-800/5 border border-emerald-700/30 flex flex-col items-center justify-center text-center p-4">
              <Star className="w-10 h-10 text-emerald-800" />
              <p className="font-display text-2xl font-bold mt-2">Checked in</p>
              <p className="text-sm text-muted">at {fmtTime(b.checked_in_at)}. Enjoy your iftar.</p>
            </div>
          ) : qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Your QR code" className="w-64 h-64" />
          ) : (
            <div className="w-64 h-64" />
          )}
          <p className="mt-3 font-mono text-2xl tracking-[0.2em] font-semibold">{shortCode(b.short_code)}</p>
          <p className="text-xs text-muted">Backup code if the QR won't scan</p>
        </div>
        <div className="border-t border-dashed border-line mt-5 pt-4 flex justify-between text-sm">
          <div><p className="text-muted text-xs">Name</p><p className="font-medium">{name}</p></div>
          <div className="text-right"><p className="text-muted text-xs">Seating</p><p className="font-medium capitalize">{b.side}</p></div>
        </div>
        <p className="text-xs text-muted mt-4">Turn your screen brightness up at the door. A screenshot works too.</p>
        {canCancel && (
          <Button variant="danger" onClick={onCancel} busy={busy} className="w-full mt-4">Cancel booking</Button>
        )}
      </div>
    </div>
  );
}
