"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useServerNow } from "@/lib/auth";
import { errorText, supabase, type Night, type NightCount, type Side } from "@/lib/supabase";
import { fmtDateTime, fmtDayLong, fmtTime, shortCode } from "@/lib/time";
import { Button, Card, Field, Notice, Spinner, inputCls } from "@/components/ui";

type Attendee = {
  booking_id: string; full_name: string; email: string | null; side: Side; short_code: string;
  status: string; checked_in_at: string | null; is_comp: boolean;
};

export default function NightAdminPage() {
  return <Suspense fallback={<Spinner />}><NightAdmin /></Suspense>;
}

function londonTime(iso: string) {
  return fmtTime(iso);
}

function NightAdmin() {
  const { ready, profile } = useAuth();
  const router = useRouter();
  const id = useSearchParams().get("id");
  const now = useServerNow(10000);
  const [night, setNight] = useState<Night | null>(null);
  const [counts, setCounts] = useState<NightCount[]>([]);
  const [rows, setRows] = useState<Attendee[]>([]);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({ date: "", time: "", room: "", capB: "0", capS: "0" });
  const [guest, setGuest] = useState({ name: "", side: "brothers" as Side });

  useEffect(() => {
    if (ready && profile?.role !== "admin") router.replace("/");
  }, [ready, profile, router]);

  const load = useCallback(async () => {
    if (!id) return;
    const sb = supabase();
    const [{ data: n }, { data: c }, { data: a }] = await Promise.all([
      sb.from("nights").select("*").eq("id", id).maybeSingle(),
      sb.rpc("night_counts", { p_night: id }),
      sb.rpc("search_attendees", { p_night: id, p_query: q }),
    ]);
    setNight(n as Night);
    setCounts((c as NightCount[]) ?? []);
    setRows((a as Attendee[]) ?? []);
  }, [id, q]);

  useEffect(() => {
    if (profile?.role !== "admin") return;
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load, profile]);

  useEffect(() => {
    if (night && !edit) {
      setForm({ date: night.night_date, time: londonTime(night.iftar_at), room: night.room, capB: String(night.capacity_brothers), capS: String(night.capacity_sisters) });
    }
  }, [night, edit]);

  async function run(fn: string, args: Record<string, unknown>, ok: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setMsg(null);
    const { error } = await supabase().rpc(fn, args);
    if (error) setMsg({ tone: "error", text: errorText(error) });
    else setMsg({ tone: "success", text: ok });
    load();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await run("admin_save_night", {
      p_id: id, p_date: form.date, p_iftar_time: form.time, p_room: form.room,
      p_capacity_brothers: Number(form.capB), p_capacity_sisters: Number(form.capS), p_opens_at: null,
    }, "Night updated. Booking opens at 6am the day before the new date.");
    setEdit(false);
  }

  function exportCsv() {
    const header = ["Name", "Email", "Seating", "Code", "Status", "Checked in"];
    const lines = rows.map((r) => [r.full_name, r.email ?? "", r.side, shortCode(r.short_code), r.is_comp ? "free ticket" : r.status, r.checked_in_at ? fmtTime(r.checked_in_at) : ""]);
    const csv = [header, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `iftar-${night?.night_date}.csv`;
    a.click();
  }

  if (!ready || profile?.role !== "admin" || !night) return <Spinner />;

  const afterIftar = now >= new Date(night.iftar_at).getTime();
  const scheduled = night.status === "scheduled";
  const notScanned = rows.filter((r) => r.status === "confirmed" && !r.checked_in_at && !r.is_comp).length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <Link href="/admin" className="text-sm text-muted no-print">← All nights</Link>
      <div className="flex flex-wrap items-end justify-between gap-4 mt-2 mb-6">
        <div>
          <h1 className="font-display text-4xl font-bold">{fmtDayLong(night.iftar_at)}</h1>
          <p className="text-muted">Iftar {fmtTime(night.iftar_at)}{night.room ? ` · ${night.room}` : ""} · Booking opens {fmtDateTime(night.booking_opens_at)}</p>
          <p className="text-sm mt-1 font-medium capitalize">{night.status === "scheduled" ? "Upcoming" : night.status}</p>
        </div>
        <div className="flex flex-wrap gap-2 no-print">
          <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
          <Button variant="outline" onClick={() => window.print()}>Print list</Button>
        </div>
      </div>

      {msg && <div className="mb-4 no-print"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {counts.map((c) => (
          <Card key={c.side} className="border-l-2 border-gold pl-4">
            <p className="text-xs uppercase tracking-wider text-muted">{c.side}</p>
            <div className="grid grid-cols-4 gap-2 mt-2 text-center">
              {[["Booked", c.booked], ["Scanned", c.checked_in], ["Walk-ins", c.walkins], ["Free", c.spots_left]].map(([l, v]) => (
                <div key={l as string}><p className="text-2xl font-semibold tabular-nums">{v}</p><p className="text-[11px] text-muted">{l}</p></div>
              ))}
            </div>
            <p className="text-xs text-muted mt-2">Capacity {c.capacity}{c.waitlisted ? ` · ${c.waitlisted} waiting` : ""}</p>
          </Card>
        ))}
      </div>

      {scheduled && (
        <Card className="py-5 mb-6 border-y border-line no-print">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setEdit((e) => !e)} variant="outline">{edit ? "Stop editing" : "Edit night"}</Button>
            {afterIftar && (
              <Button onClick={() => run("admin_close_night", { p_night: id }, "Night closed. Strikes have been applied.",
                `Close this night? ${notScanned} booked ${notScanned === 1 ? "person wasn't" : "people weren't"} scanned and will get a strike. Fix any missed scans first.`)}>
                Close night
              </Button>
            )}
            <Button variant="danger" onClick={() => run("admin_cancel_night", { p_night: id }, "Night cancelled. All bookings were cancelled with no strikes.",
              "Cancel this whole night? Every booking is cancelled, with no strikes.")}>Cancel night</Button>
          </div>
          {!afterIftar && <p className="text-xs text-muted mt-3">Close night appears after iftar time. If nobody closes it, it closes itself at 3am.</p>}

          {edit && (
            <form onSubmit={save} className="grid sm:grid-cols-5 gap-3 mt-5 items-end">
              <Field label="Date"><input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></Field>
              <Field label="Iftar"><input type="time" required value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputCls} /></Field>
              <Field label="Room"><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} className={inputCls} /></Field>
              <Field label="Brothers"><input type="number" min={0} value={form.capB} onChange={(e) => setForm({ ...form, capB: e.target.value })} className={inputCls} /></Field>
              <Field label="Sisters"><input type="number" min={0} value={form.capS} onChange={(e) => setForm({ ...form, capS: e.target.value })} className={inputCls} /></Field>
              <Button type="submit" className="sm:col-span-5">Save changes</Button>
            </form>
          )}

          <form className="flex flex-wrap gap-2 mt-5 items-end" onSubmit={(e) => {
            e.preventDefault();
            run("admin_add_free_ticket", { p_night: id, p_name: guest.name, p_side: guest.side }, `Free ticket added for ${guest.name}.`);
            setGuest({ ...guest, name: "" });
          }}>
            <div className="flex-1 min-w-48"><Field label="Free ticket (volunteers, speakers)"><input required value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} className={inputCls} placeholder="Name" /></Field></div>
            <select value={guest.side} onChange={(e) => setGuest({ ...guest, side: e.target.value as Side })} className={`${inputCls} !w-auto`}>
              <option value="brothers">Brothers</option><option value="sisters">Sisters</option>
            </select>
            <Button type="submit" variant="outline">Add</Button>
          </form>
        </Card>
      )}

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or code" className={`${inputCls} no-print`} />
      <Card className="mt-3 overflow-x-auto border-t border-line">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="pr-4 py-3 font-medium">Name</th><th className="pr-4 py-3 font-medium">Seating</th>
              <th className="pr-4 py-3 font-medium">Code</th><th className="pr-4 py-3 font-medium">Status</th>
              <th className="pr-4 py-3 font-medium no-print"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-5 text-muted">No bookings.</td></tr>}
            {rows.map((r) => (
              <tr key={r.booking_id}>
                <td className="pr-4 py-3"><p className="font-medium">{r.full_name}</p>{r.email && <p className="text-xs text-muted">{r.email}</p>}</td>
                <td className="pr-4 py-3 capitalize">{r.side}</td>
                <td className="pr-4 py-3 font-mono">{shortCode(r.short_code)}</td>
                <td className="pr-4 py-3">
                  {r.is_comp && <span className="text-gold font-semibold mr-1">Free</span>}
                  {r.status === "confirmed" ? (r.checked_in_at ? <span className="text-crimson-800 font-medium">In {fmtTime(r.checked_in_at)}</span> : "Booked") : r.status === "offered" ? "Offered spot" : "Waitlist"}
                </td>
                <td className="pr-4 py-3 text-right whitespace-nowrap no-print">
                  {scheduled && r.status === "confirmed" && !r.checked_in_at && (
                    <button className="text-crimson-800 font-medium mr-3" onClick={() => run("admin_check_in", { p_booking: r.booking_id }, `${r.full_name} checked in.`)}>Check in</button>
                  )}
                  {scheduled && r.checked_in_at && (
                    <button className="text-muted mr-3" onClick={() => run("admin_undo_check_in", { p_booking: r.booking_id }, "Check-in undone.", `Undo ${r.full_name}'s check-in?`)}>Undo</button>
                  )}
                  {scheduled && !r.checked_in_at && (
                    <button className="text-danger" onClick={() => run("admin_cancel_booking", { p_booking: r.booking_id }, "Booking cancelled.", `Cancel ${r.full_name}'s booking? No strike is given.`)}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
