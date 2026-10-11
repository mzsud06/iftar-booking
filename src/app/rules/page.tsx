import { PageTitle } from "@/components/ui";

export const metadata = { title: "Rules · KCL ISoc Iftars" };

const rules: [string, string][] = [
  ["Booking", "Opens 6am the day before. Closes 3 hours before iftar. One spot each."],
  ["Waitlist", "If a spot opens, you get 1 hour to confirm it."],
  ["Door", "Show your QR or backup code. Doors open 30 minutes before iftar. Unscanned spots go to walk-ins at iftar time."],
  ["Cancelling", "Free up to 3 hours before. Later counts as a late cancel. Every third late cancel is a strike."],
  ["Strikes", "Booked but not scanned is a strike. Two strikes block your next iftar. Repeat blocks get longer."],
  ["Mistakes", "Contact the ISoc and an admin can remove a strike. Everything resets after Ramadan."],
];

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <PageTitle title="Rules" />
      <div className="rule" />
      {rules.map(([t, d]) => (
        <div key={t} className="grid sm:grid-cols-[140px_1fr] gap-1 sm:gap-6 py-5 border-b border-line">
          <h2 className="font-display text-2xl font-semibold text-crimson-900">{t}</h2>
          <p className="text-[15px] text-ink/80">{d}</p>
        </div>
      ))}

      <h2 id="privacy" className="font-display text-4xl font-bold text-crimson-900 mt-16">Privacy</h2>
      <div className="rule mt-4" />
      <div className="py-5 space-y-2 text-[15px] text-ink/80">
        <p>We store your name, email, seating, bookings and check-ins.</p>
        <p>Admins see names and emails. Door volunteers see names only.</p>
        <p>Everything is deleted by 30 April 2027. Never used for marketing.</p>
      </div>
    </div>
  );
}
