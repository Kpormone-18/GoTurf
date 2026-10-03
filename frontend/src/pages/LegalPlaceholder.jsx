import { Link } from "react-router-dom";

export default function LegalPlaceholder({ title }) {
  return <section className="mx-auto min-h-[60vh] max-w-2xl px-5 py-20 text-center"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">GoTurf legal</p><h1 className="mt-4 font-display text-4xl font-black tracking-tight">{title}</h1><p className="mx-auto mt-4 max-w-lg text-muted-foreground">This information page is being prepared. Please check back soon.</p><Link to="/" className="mt-8 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90">Back to Discover</Link></section>;
}
