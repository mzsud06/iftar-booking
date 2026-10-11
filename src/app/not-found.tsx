import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-24">
      <p className="text-xs uppercase tracking-[0.2em] text-gold-ink font-semibold">404</p>
      <h1 className="font-display text-5xl font-bold text-crimson-900 mt-2">Page not found</h1>
      <Link href="/" className="inline-block mt-8 bg-crimson-900 text-ivory px-6 py-3 font-medium">Back to iftars</Link>
    </div>
  );
}
