"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useServerNow } from "@/lib/auth";
import { errorText, supabase, type Night, type NightCount, type Side } from "@/lib/supabase";
import { fmtPlainDate, fmtTime, shortCode } from "@/lib/time";
import { Button, Card, Notice, Spinner, inputCls } from "@/components/ui";

type ScanResult = {
  result: "ok" | "already" | "wrong_night" | "cancelled" | "not_confirmed" | "not_found" | "error";
  name?: string;
  side?: Side;
  checked_in_at?: string;
  night_date?: string;
  is_comp?: boolean;
  message?: string;
};

type Attendee = {
  booking_id: string; full_name: string; side: Side; short_code: string;
  status: string; checked_in_at: string | null; is_comp: boolean;
};

export default function ScanPage() {
  const { ready, profile } = useAuth();
  const router = useRouter();
  const now = useServerNow(5000);
  const [nights, setNights] = useState<Night[] | null>(null);
  const [nightId, setNightId] = useState<string | null>(null);
  const [tab, setTab] = useState<"scan" | "search" | "walkins">("scan");
  const [counts, setCounts] = useState<NightCount[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);

  const staff = profile && (profile.role === "volunteer" || profile.role === "admin");

  useEffect(() => {
    if (ready && !staff) router.replace(profile ? "/" : "/login");
  }, [ready, staff, profile, router]);

  useEffect(() => {
    if (!staff) return;
    (async () => {
      const from = new Date(Date.now() - 2 * 86400_000).toISOString().slice(0, 10);
      const { data } = await supabase().from("nights").select("*").eq("status", "scheduled")
        .gte("night_date", from).order("night_date").limit(10);
      const list = (data as Night[]) ?? [];
      setNights(list);
      const current = list.find((n) => new Date(n.iftar_at).getTime() + 5 * 3600_000 > Date.now()) ?? list[0];
      setNightId(current?.id ?? null);
    })();
  }, [staff]);

  const loadCounts = useCallback(async () => {
    if (!nightId) return;
    const { data } = await supabase().rpc("night_counts", { p_night: nightId });
    setCounts((data as NightCount[]) ?? []);
  }, [nightId]);

  useEffect(() => {
    loadCounts();
    const t = setInterval(loadCounts, 5000);
    return () => clearInterval(t);
  }, [loadCounts]);

  const doCheckIn = useCallback(async (code: string) => {
    if (!nightId) return;
    const { data, error } = await supabase().rpc("check_in", { p_night: nightId, p_code: code });
    const r: ScanResult = error ? { result: "error", message: errorText(error) } : (data as ScanResult);
    setResult(r);
    if (navigator.vibrate) navigator.vibrate(r.result === "ok" ? 80 : [200, 100, 200]);
    loadCounts();
  }, [nightId, loadCounts]);

  if (!ready || !staff || nights === null) return <Spinner />;

  const night = nights.find((n) => n.id === nightId) ?? null;
  const afterIftar = night ? now >= new Date(night.iftar_at).getTime() : false;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      {nights.length === 0 ? (
        <Notice>No upcoming nights. An admin needs to add them first.</Notice>
      ) : (
        <>
          <select value={nightId ?? ""} onChange={(e) => setNightId(e.target.value)} className={`${inputCls} font-medium`}>
            {nights.map((n) => (
              <option key={n.id} value={n.id}>{fmtPlainDate(n.night_date)} · {fmtTime(n.iftar_at)}{n.campus ? ` · ${n.campus}` : ""}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2 mt-3">
            {counts.map((c) => (
              <div key={c.side} className="border-l-2 border-gold pl-3 py-1">
                <p className="text-[11px] uppercase tracking-wider text-muted">{c.side}</p>
                <p className="text-lg font-semibold tabular-nums">{c.checked_in}<span className="text-muted font-normal text-sm"> / {c.booked} in</span></p>
                <p className="text-xs text-muted">{c.walkins} walk-ins · <span className={c.spots_left > 0 ? "text-crimson-800 font-semibold" : ""}>{c.spots_left} free</span></p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 mt-5 text-sm font-medium border-b border-line">
            {(["scan", "search", "walkins"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`py-2.5 -mb-px border-b-2 ${tab === t ? "border-crimson-900 text-crimson-900" : "border-transparent text-muted"}`}>
                {t === "scan" ? "Scan" : t === "search" ? "Search" : "Walk-ins"}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "scan" && <Scanner paused={!!result} onCode={doCheckIn} />}
            {tab === "search" && nightId && <Search nightId={nightId} onCheckIn={doCheckIn} refreshKey={result} />}
            {tab === "walkins" && nightId && <WalkIns nightId={nightId} counts={counts} afterIftar={afterIftar} onChange={loadCounts} />}
          </div>
        </>
      )}

      {result && <ResultOverlay r={result} onClose={() => setResult(null)} />}
    </div>
  );
}

function Scanner({ paused, onCode }: { paused: boolean; onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<{ start: () => Promise<void>; stop: () => void; destroy: () => void } | null>(null);
  const pausedRef = useRef(paused);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [camError, setCamError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const QrScanner = (await import("qr-scanner")).default;
      if (disposed || !videoRef.current) return;
      const scanner = new QrScanner(
        videoRef.current,
        (res) => {
          const code = res.data;
          const t = Date.now();
          if (pausedRef.current) return;
          if (code === lastRef.current.code && t - lastRef.current.at < 4000) return;
          lastRef.current = { code, at: t };
          onCode(code);
        },
        { preferredCamera: "environment", highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8 },
      );
      scannerRef.current = scanner;
      try {
        await scanner.start();
      } catch {
        setCamError("Camera blocked. Allow it in browser settings, or type the code.");
      }
    })();
    return () => {
      disposed = true;
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
    };
  }, [onCode]);

  return (
    <div>
      <div className="relative overflow-hidden bg-black aspect-square">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
      </div>
      {camError && <div className="mt-3"><Notice tone="warn">{camError}</Notice></div>}
      <form className="flex gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { onCode(manual); setManual(""); } }}>
        <input value={manual} onChange={(e) => setManual(e.target.value.toUpperCase())} placeholder="Backup code"
          className={`${inputCls} font-mono tracking-widest placeholder:font-sans placeholder:tracking-normal`} autoCapitalize="characters" />
        <Button type="submit">Check</Button>
      </form>
    </div>
  );
}

function Search({ nightId, onCheckIn, refreshKey }: { nightId: string; onCheckIn: (code: string) => void; refreshKey: unknown }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const { data } = await supabase().rpc("search_attendees", { p_night: nightId, p_query: q });
      setRows((data as Attendee[]) ?? []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, nightId, refreshKey]);

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code" className={inputCls} autoFocus />
      <Card className="mt-3 divide-y divide-line border-y border-line">
        {rows.length === 0 && <p className="py-4 text-sm text-muted">{loading ? "Searching..." : "No one found."}</p>}
        {rows.map((r) => (
          <div key={r.booking_id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{r.full_name}{r.is_comp && <span className="ml-1.5 text-xs text-gold-ink font-semibold">FREE</span>}</p>
              <p className="text-xs text-muted capitalize">{r.side} · {shortCode(r.short_code)} · {r.status === "confirmed" ? (r.checked_in_at ? `in at ${fmtTime(r.checked_in_at)}` : "booked") : r.status}</p>
            </div>
            {r.status === "confirmed" && !r.checked_in_at && (
              <Button variant="outline" className="!py-2 !px-4 text-sm" onClick={() => onCheckIn(r.short_code)}>Check in</Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

function WalkIns({ nightId, counts, afterIftar, onChange }:
  { nightId: string; counts: NightCount[]; afterIftar: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(side: Side) {
    setBusy(side); setError(null);
    const { error } = await supabase().rpc("add_walkin", { p_night: nightId, p_side: side });
    setBusy(null);
    if (error) setError(errorText(error));
    onChange();
  }
  async function undo(side: Side) {
    setBusy(side); setError(null);
    await supabase().rpc("remove_walkin", { p_night: nightId, p_side: side });
    setBusy(null);
    onChange();
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{afterIftar ? "Unscanned spots are now free." : "Unscanned spots open at iftar time."}</p>
      {counts.map((c) => (
        <Card key={c.side} className="py-4 border-b border-line">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">{c.side}</p>
              <p className="font-display text-4xl font-bold tabular-nums">{c.spots_left}<span className="text-base font-sans font-normal text-muted"> free</span></p>
              <p className="text-xs text-muted">{c.walkins} walk-ins so far</p>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="gold" onClick={() => add(c.side)} busy={busy === c.side} disabled={c.spots_left <= 0}>+1 walk-in</Button>
              <Button variant="ghost" className="!py-1.5 text-sm" onClick={() => undo(c.side)} disabled={busy === c.side || c.walkins === 0}>Undo last</Button>
            </div>
          </div>
        </Card>
      ))}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function ResultOverlay({ r, onClose }: { r: ScanResult; onClose: () => void }) {
  useEffect(() => {
    if (r.result !== "ok") return;
    const t = setTimeout(onClose, 2200);
    return () => clearTimeout(t);
  }, [r, onClose]);

  const map: Record<ScanResult["result"], { bg: string; title: string; sub?: string }> = {
    ok: { bg: "bg-crimson-800", title: `Welcome${r.name ? `, ${r.name.split(" ")[0]}` : ""}`, sub: r.is_comp ? "Free ticket" : undefined },
    already: { bg: "bg-warn", title: "Already scanned", sub: r.checked_in_at ? `Checked in at ${fmtTime(r.checked_in_at)}` : undefined },
    wrong_night: { bg: "bg-danger", title: "Wrong night", sub: r.night_date ? `This ticket is for ${fmtPlainDate(r.night_date)}` : undefined },
    cancelled: { bg: "bg-danger", title: "Cancelled ticket", sub: "This booking was cancelled." },
    not_confirmed: { bg: "bg-danger", title: "Not confirmed", sub: "This person is on the waitlist, not booked." },
    not_found: { bg: "bg-danger", title: "Not found", sub: "This isn't a ticket for these iftars." },
    error: { bg: "bg-danger", title: "Couldn't check", sub: r.message },
  };
  const m = map[r.result];

  return (
    <button onClick={onClose} className={`fixed inset-0 z-50 ${m.bg} text-white flex flex-col items-center justify-center p-8 text-center`}>
      <p className="font-display text-5xl font-bold leading-tight">{m.title}</p>
      {r.name && r.result !== "ok" && <p className="mt-3 text-xl">{r.name}</p>}
      {r.side && <p className="mt-2 text-lg uppercase tracking-[0.2em] opacity-90">{r.side}</p>}
      {m.sub && <p className="mt-3 text-lg opacity-90">{m.sub}</p>}
      <p className="absolute bottom-10 text-sm opacity-80">{r.result === "ok" ? "Next person" : "Tap to continue"}</p>
    </button>
  );
}

