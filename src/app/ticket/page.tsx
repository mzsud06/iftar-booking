"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useAuth, useServerNow } from "@/lib/auth";
import { errorText, place, supabase, type MyBooking } from "@/lib/supabase";
import { countdown, fmtDayLong, fmtTime, hoursBefore, shortCode } from "@/lib/time";
import { Button, LinkButton, Notice, Spinner } from "@/components/ui";

export default function TicketPage() {
  const { ready, session, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const now = useServerNow();
  const [items, setItems] = useState<MyBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc("my_bookings");
    if (error) {
      // No signal: show the last tickets saved on this phone so the QR still works at the door.
      try {
        const cached = localStorage.getItem("iftar:tickets");
        if (cached) {
          const keep = (JSON.parse(cached) as MyBooking[]).filter(
            (b) => new Date(b.iftar_at).getTime() + 3 * 3600_000 > Date.now(),
          );
          setOffline(true);
          setItems(keep);
          return;
        }
      } catch {}
      setError(errorText(error));
      setItems([]);
      return;
    }
    setOffline(false);
    const list = (data as MyBooking[]) ?? [];
    if (list.length) {
      const { data: ns } = await supabase().from("nights").select("id, campus").in("id", list.map((b) => b.night_id));
      const campus = new Map((ns ?? []).map((n: { id: string; campus: string | null }) => [n.id, n.campus]));
      list.forEach((b) => { b.campus = campus.get(b.night_id) ?? null; });
    }
    try { localStorage.setItem("iftar:tickets", JSON.stringify(list)); } catch {}
    setItems(list);
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
      ? late ? "Late cancel (under 3 hours). Every third one is a strike. Cancel anyway?" : "Cancel your booking?"
      : b.status === "offered" ? "Turn down this spot?" : "Leave the waitlist?";
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
    <div className="mx-auto max-w-md px-6 py-10">
      {error && <div className="mb-6"><Notice tone="error">{error}</Notice></div>}
      {offline && <div className="mb-6"><Notice tone="warn">No signal. Showing your saved ticket.</Notice></div>}

      {items.length === 0 && (
        <div className="py-10">
          <h1 className="font-display text-5xl font-bold text-crimson-900">No ticket yet</h1>
          <LinkButton href="/" variant="primary" className="mt-6">See iftars</LinkButton>
        </div>
      )}

      <div className="space-y-14">
        {items.map((b) =>
          b.status === "confirmed" ? (
            <Ticket key={b.booking_id} b={b} name={profile.full_name} now={now}
              onCancel={() => cancel(b)} busy={busyId === b.booking_id} />
          ) : b.status === "offered" ? (
            <div key={b.booking_id}>
              <p className="text-xs uppercase tracking-[0.2em] text-gold-ink font-semibold">Spot available</p>
              <h2 className="font-display text-4xl font-bold text-crimson-900 mt-1">{fmtDayLong(b.iftar_at)}</h2>
              {b.offer_expires_at && (
                <p className="mt-2 text-muted">Confirm within <span className="text-ink font-semibold tabular-nums">{countdown(new Date(b.offer_expires_at).getTime() - now)}</span></p>
              )}
              <div className="flex items-center gap-6 mt-5">
                <Button variant="primary" onClick={() => confirmOffer(b)} busy={busyId === b.booking_id}>Confirm</Button>
                <Button variant="ghost" className="!px-0" onClick={() => cancel(b)} disabled={busyId === b.booking_id}>No thanks</Button>
              </div>
            </div>
          ) : (
            <div key={b.booking_id}>
              <p className="text-xs uppercase tracking-[0.2em] text-gold-ink font-semibold">Waitlist</p>
              <h2 className="font-display text-4xl font-bold text-crimson-900 mt-1">{fmtDayLong(b.iftar_at)}</h2>
              <p className="font-display text-7xl font-bold text-crimson-900 mt-4 leading-none">#{b.waitlist_position}</p>
              <p className="text-sm text-muted mt-2">Closes {fmtTime(hoursBefore(b.iftar_at, 3).toISOString())}</p>
              <Button variant="ghost" className="!px-0 mt-4" onClick={() => cancel(b)} busy={busyId === b.booking_id}>Leave waitlist</Button>
            </div>
          ),
        )}
      </div>

      <div className="mt-16">
        <div className="rule" />
        <div className="flex items-center justify-between pt-4 text-sm">
          <span className="text-muted">Strikes</span>
          <span className="flex items-center gap-1.5">
            {[0, 1].map((i) => (
              <span key={i} className={`w-3 h-3 rotate-45 ${i < profile.strikes ? "bg-crimson-800" : "border border-crimson-900/30"}`} />
            ))}
          </span>
        </div>
        {profile.ban_nights_left > 0 && (
          <p className="text-sm text-danger mt-3">
            Blocked for {profile.ban_nights_left >= 1000 ? "the rest of Ramadan" : `${profile.ban_nights_left} more iftar${profile.ban_nights_left > 1 ? "s" : ""}`}.
          </p>
        )}
      </div>
    </div>
  );
}

function Ticket({ b, name, now, onCancel, busy }:
  { b: MyBooking; name: string; now: number; onCancel: () => void; busy: boolean }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(`IFTAR:${b.token}`, { width: 560, margin: 2, errorCorrectionLevel: "M", color: { dark: "#2a0b10", light: "#ffffff" } })
      .then(setQr);
  }, [b.token]);

  const iftar = new Date(b.iftar_at).getTime();
  const canCancel = !b.checked_in_at && now < iftar;

  return (
    <div>
      <div className="bg-crimson-900 text-ivory relative overflow-hidden px-6 pt-7 pb-8">
        <div className="pattern pattern-fade absolute inset-0" aria-hidden />
        <div className="relative">
          <p className="text-xs uppercase tracking-[0.25em] text-gold font-semibold">Iftar ticket</p>
          <h2 className="font-display text-4xl font-bold mt-2 leading-none">{fmtDayLong(b.iftar_at)}</h2>
          <p className="text-ivory/75 mt-3">{fmtTime(b.iftar_at)}{place(b) ? ` · ${place(b)}` : ""}</p>
        </div>
      </div>
      <div className="bg-white flex flex-col items-center px-6 py-8">
        {b.checked_in_at ? (
          <div className="w-64 h-64 flex flex-col items-center justify-center text-center">
            <p className="font-display text-4xl font-bold text-crimson-900">Checked in</p>
            <p className="text-sm text-muted mt-1">{fmtTime(b.checked_in_at)}</p>
          </div>
        ) : qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Your QR code" className="w-64 h-64" />
        ) : (
          <div className="w-64 h-64" />
        )}
        <p className="mt-4 font-mono text-2xl tracking-[0.25em] text-crimson-900">{shortCode(b.short_code)}</p>
        <p className="mt-4 text-sm"><span className="font-medium">{name}</span> <span className="text-muted capitalize">· {b.side}</span></p>
      </div>
      {canCancel && (
        <div className="text-center mt-4">
          <Button variant="danger" onClick={onCancel} busy={busy}>Cancel booking</Button>
        </div>
      )}
    </div>
  );
}
