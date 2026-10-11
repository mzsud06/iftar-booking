import { Card, PageTitle } from "@/components/ui";

export const metadata = { title: "Rules and privacy · KCL ISoc Iftars" };

const rules: [string, string][] = [
  ["Booking opens at 6am the day before", "Each iftar opens for booking at 6am the previous day and closes 3 hours before iftar. One spot per person. Nobody can book for someone else."],
  ["When it's full, join the waitlist", "If someone cancels, the next person in line is offered the spot and has 1 hour to confirm it. No confirm means no ticket and no strike, and the offer moves on."],
  ["Show your QR code at the door", "Your ticket is under My ticket. A screenshot works. If the QR won't scan, the door team can use your backup code or your name."],
  ["Doors open 30 minutes before iftar", "Spots not scanned by iftar time go to walk-ins. If you arrive later you'll still be scanned, but food isn't guaranteed."],
  ["Cancel if you can't come", "Cancelling up to 3 hours before iftar is free. After that it counts as a late cancel, and every third late cancel is a strike. A late cancel still helps, because a walk-in gets your spot."],
  ["Missing a booking is a strike", "Booked, didn't cancel and weren't scanned: that's a strike. Two strikes block your next iftar booking. A second ban lasts 3 iftars, and a third lasts the rest of Ramadan."],
  ["Mistakes get fixed", "If you came but weren't scanned, or had an emergency, contact the ISoc and an admin can remove the strike. Everything resets after Ramadan."],
];

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <PageTitle kicker="How it works" title="Rules">
        These keep food from going to waste and make sure everyone gets a fair chance.
      </PageTitle>
      <Card className="divide-y divide-line">
        {rules.map(([t, d], i) => (
          <div key={t} className="px-5 py-4 flex gap-4">
            <span className="font-display text-2xl font-bold text-gold w-6 shrink-0">{i + 1}</span>
            <div>
              <h2 className="font-medium">{t}</h2>
              <p className="text-sm text-muted mt-1">{d}</p>
            </div>
          </div>
        ))}
      </Card>

      <h2 id="privacy" className="font-display text-3xl font-bold mt-12 mb-3">Privacy</h2>
      <Card className="p-5 space-y-3 text-[15px]">
        <p><strong>What we collect:</strong> your name, email address and whether you sit with the brothers or sisters, plus your bookings and check-ins.</p>
        <p><strong>Why:</strong> to give you a ticket, manage the waitlist, check people in and apply the strike rule fairly.</p>
        <p><strong>Who can see it:</strong> ISoc admins can see names and emails. Door volunteers only see names and seating.</p>
        <p><strong>How long we keep it:</strong> all personal data is deleted by 30 April 2027. We keep only anonymous totals, like how many people came each night.</p>
        <p><strong>Allergies:</strong> we don't collect health information. Ask the ISoc about the menu's allergens before you come.</p>
        <p>We never use this list for marketing.</p>
      </Card>
    </div>
  );
}
