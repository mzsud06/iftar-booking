"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { errorText, supabase, type Night, type Role, type Side } from "@/lib/supabase";
import { fmtDateTime, fmtPlainDate, fmtTime } from "@/lib/time";
import { Button, Card, Field, Notice, PageTitle, Spinner, inputCls } from "@/components/ui";

type Person = {
  id: string; full_name: string; email: string; side: Side; role: Role;
  strikes: number; late_cancels: number; bans: number; ban_nights_left: number; created_at: string;
};
type AuditRow = { at: string; actor_name: string | null; person_name: string | null; night_date: string | null; action: string; detail: string | null };

export default function AdminPage() {
  const { ready, profile } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"nights" | "people" | "activity">("nights");

  useEffect(() => {
    if (ready && profile?.role !== "admin") router.replace("/");
  }, [ready, profile, router]);

  if (!ready || profile?.role !== "admin") return <Spinner />;

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <PageTitle kicker="Ramadan team" title="Admin" />
      <div className="flex gap-6 text-sm font-medium mb-8 border-b border-line">
        {(["nights", "people", "activity"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`py-2.5 -mb-px border-b-2 capitalize ${tab === t ? "border-crimson-900 text-crimson-900" : "border-transparent text-muted"}`}>{t}</button>
        ))}
      </div>
      {tab === "nights" && <Nights />}
      {tab === "people" && <People myId={profile.id} />}
      {tab === "activity" && <Activity />}
    </div>
  );
}

function Nights() {
  const [nights, setNights] = useState<Night[] | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [room, setRoom] = useState("");
  const [capB, setCapB] = useState("100");
  const [capS, setCapS] = useState("100");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase().from("nights").select("*").order("night_date");
    setNights((data as Night[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabase().rpc("admin_save_night", {
      p_id: null, p_date: date, p_iftar_time: time, p_room: room,
      p_capacity_brothers: Number(capB), p_capacity_sisters: Number(capS), p_opens_at: null,
    });
    setBusy(false);
    if (error) return setMsg({ tone: "error", text: errorText(error) });
    setMsg({ tone: "success", text: `Added ${fmtPlainDate(date)}. Booking opens at 6am the day before.` });
    const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    setDate(next.toISOString().slice(0, 10));
    load();
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
      <Card className="border-t border-line">
        {nights === null ? <Spinner /> : nights.length === 0 ? (
          <p className="py-5 text-muted">No nights yet. Add the first one.</p>
        ) : (
          <div className="divide-y divide-line">
            {nights.map((n) => (
              <Link key={n.id} href={`/admin/night?id=${n.id}`} className="flex items-center justify-between gap-4 py-4 border-b border-line hover:text-crimson-900">
                <div>
                  <p className="font-medium">{fmtPlainDate(n.night_date)} <span className="text-muted font-normal">· iftar {fmtTime(n.iftar_at)}</span></p>
                  <p className="text-sm text-muted">{n.room || "No room set"} · {n.capacity_brothers} brothers, {n.capacity_sisters} sisters</p>
                </div>
                <span className={`text-xs font-semibold uppercase tracking-wider ${
                  n.status === "scheduled" ? "text-crimson-900" : n.status === "closed" ? "text-muted" : "text-danger"}`}>
                  {n.status === "scheduled" ? "Upcoming" : n.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="lg:border-l lg:border-line lg:pl-6">
        <h2 className="font-medium mb-4">Add a night</h2>
        <form onSubmit={add} className="space-y-3">
          <Field label="Date"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
          <Field label="Iftar time" hint="Use the mosque timetable you follow."><input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} /></Field>
          <Field label="Room"><input value={room} onChange={(e) => setRoom(e.target.value)} className={inputCls} placeholder="e.g. Great Hall, Strand" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brothers"><input type="number" min={0} required value={capB} onChange={(e) => setCapB(e.target.value)} className={inputCls} /></Field>
            <Field label="Sisters"><input type="number" min={0} required value={capS} onChange={(e) => setCapS(e.target.value)} className={inputCls} /></Field>
          </div>
          <p className="text-xs text-muted">Capacity = the smaller of the room limit and the food ordered.</p>
          <Button type="submit" busy={busy} className="w-full">Add night</Button>
        </form>
        {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      </Card>
    </div>
  );
}

function People({ myId }: { myId: string }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase().rpc("admin_people", { p_query: q });
    if (error) setError(errorText(error));
    setRows((data as Person[]) ?? []);
  }, [q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  async function update(p: Person, args: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    const { error } = await supabase().rpc("admin_update_person", { p_user: p.id, ...args });
    if (error) setError(errorText(error));
    load();
  }

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className={inputCls} />
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <Card className="mt-4 divide-y divide-line border-y border-line">
        {rows === null ? <Spinner /> : rows.length === 0 ? <p className="py-5 text-muted">No one found.</p> : rows.map((p) => (
          <div key={p.id} className="py-4 flex flex-wrap items-center gap-x-6 gap-y-3 justify-between">
            <div className="min-w-0">
              <p className="font-medium">{p.full_name}{p.id === myId && <span className="text-xs text-muted"> (you)</span>}</p>
              <p className="text-sm text-muted truncate">{p.email}</p>
              <p className="text-xs mt-1">
                Strikes <strong>{p.strikes}</strong> · Late cancels {p.late_cancels} · Bans {p.bans}
                {p.ban_nights_left > 0 && <span className="text-danger font-medium"> · Blocked {p.ban_nights_left >= 1000 ? "for Ramadan" : `${p.ban_nights_left} night(s)`}</span>}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={p.side} onChange={(e) => update(p, { p_side: e.target.value }, `Move ${p.full_name} to ${e.target.value}?`)}
                className="border-b border-crimson-900/30 bg-transparent py-2 text-sm">
                <option value="brothers">Brothers</option><option value="sisters">Sisters</option>
              </select>
              <select value={p.role} onChange={(e) => update(p, { p_role: e.target.value }, `Make ${p.full_name} ${e.target.value === "attendee" ? "a regular attendee" : `a${e.target.value === "admin" ? "n" : ""} ${e.target.value}`}?`)}
                className="border-b border-crimson-900/30 bg-transparent py-2 text-sm">
                <option value="attendee">Attendee</option><option value="volunteer">Volunteer</option><option value="admin">Admin</option>
              </select>
              {p.strikes > 0 && <Button variant="outline" className="!py-2 !px-3 text-sm" onClick={() => update(p, { p_remove_strike: true }, `Remove one strike from ${p.full_name}?`)}>Remove strike</Button>}
              {p.ban_nights_left > 0 && <Button variant="outline" className="!py-2 !px-3 text-sm" onClick={() => update(p, { p_lift_ban: true }, `Lift ${p.full_name}'s block?`)}>Lift block</Button>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

const actionLabels: Record<string, string> = {
  strike: "Strike", ban: "Blocked", booking_cancelled_by_ban: "Booking cancelled by block", night_closed: "Night closed",
  night_created: "Night added", night_edited: "Night edited", night_cancelled: "Night cancelled", free_ticket: "Free ticket",
  admin_cancelled_booking: "Booking cancelled by admin", undo_check_in: "Check-in undone", manual_check_in: "Checked in by admin",
  role_changed: "Role changed", side_changed: "Seating changed", strike_removed: "Strike removed", ban_lifted: "Block lifted",
};

function Activity() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    supabase().rpc("admin_audit", { p_limit: 200 }).then(({ data }) => setRows((data as AuditRow[]) ?? []));
  }, []);
  return (
    <Card className="divide-y divide-line border-y border-line">
      {rows === null ? <Spinner /> : rows.length === 0 ? <p className="py-5 text-muted">Nothing yet.</p> : rows.map((r, i) => (
        <div key={i} className="py-3 text-sm flex flex-wrap justify-between gap-2">
          <span>
            <strong>{actionLabels[r.action] ?? r.action}</strong>
            {r.person_name && <> · {r.person_name}</>}
            {r.night_date && <> · {fmtPlainDate(r.night_date)}</>}
            {r.detail && <span className="text-muted"> · {r.detail}</span>}
          </span>
          <span className="text-muted">{r.actor_name ? `${r.actor_name}, ` : "Automatic, "}{fmtDateTime(r.at)}</span>
        </div>
      ))}
    </Card>
  );
}
