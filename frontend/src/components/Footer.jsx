import { BrandMark } from "./BrandMark";
import { Link } from "react-router-dom";
import { ArrowUpRight, ShieldCheck, Zap } from "lucide-react";

const platformLinks = ["Find a pitch", "List your turf", "Find a booking"];
const trustLinks = ["Escrow-protected payments", "Instant confirmation", "Clear cancellation terms"];

export const Footer = () => (
  <footer className="relative mt-16 bg-[#06281f] text-white">
    <div className="pointer-events-none absolute left-0 bottom-0 h-64 w-64 rounded-full bg-primary/70 blur-3xl" />
    <div className="pointer-events-none absolute right-0 top-24 h-56 w-56 rounded-full bg-emerald-400/10 blur-3xl" />
    <div className="relative mx-auto max-w-7xl px-5 pb-8 pt-20 lg:px-8">
      <div className="absolute -top-10 left-1/2 grid h-20 w-20 -translate-x-1/2 place-items-center rounded-full border-8 border-background bg-accent shadow-lg"><BrandMark className="h-10 w-10" /></div>
      <div className="text-center">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">Built for the game</p>
        <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl font-black tracking-tight sm:text-5xl">Every good match starts with the right pitch.</h2>
      </div>
      <div className="mt-14 grid gap-10 md:grid-cols-3 md:items-center">
        <div className="text-center md:text-left"><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">Play with confidence</p><ul className="mt-4 space-y-3 text-sm text-white/75">{trustLinks.map((item) => <li key={item} className="flex items-center justify-center gap-2 md:justify-start"><ShieldCheck className="h-4 w-4 text-emerald-300" />{item}</li>)}</ul></div>
        <div className="flex flex-col items-center text-center"><div className="grid h-24 w-24 place-items-center rounded-full border border-white/20 bg-white/10 shadow-inner"><BrandMark className="h-16 w-16 brightness-150" decorative={false} /></div><p className="mt-5 max-w-xs text-sm leading-relaxed text-white/65">Discover well-managed AstroTurf pitches, secure your time, and get back to the game.</p><a href="/#hero" onClick={(event) => {
          const hero = document.getElementById("hero");
          if (!hero || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          hero.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
          hero.focus({ preventScroll: true });
        }} className="mt-5 inline-flex min-h-12 max-w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90">Discover pitches <ArrowUpRight className="h-4 w-4" /></a></div>
        <div className="text-center md:text-right"><p className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">GoTurf platform</p><ul className="mt-4 space-y-3 text-sm text-white/75">{platformLinks.map((item) => <li key={item}><Link to={item === "Find a pitch" ? "/#discover" : item === "List your turf" ? "/owner" : "/lookup"} className="inline-flex items-center gap-2 transition-colors hover:text-emerald-300">{item}<ArrowUpRight className="h-3.5 w-3.5" /></Link></li>)}</ul><p className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-emerald-200"><Zap className="h-4 w-4" /> Instant confirmations</p></div>
      </div>
      <div className="mt-14 flex flex-col items-center gap-3 border-t border-white/15 pt-6 text-center text-xs text-white/50 sm:flex-row sm:justify-between sm:text-left"><span>© 2026 GoTurf</span><nav aria-label="Legal information" className="flex flex-wrap justify-center gap-x-2 gap-y-1 sm:justify-end"><Link to="/privacy" className="transition-colors hover:text-emerald-300 focus-visible:text-emerald-300">Privacy</Link><span aria-hidden="true">·</span><Link to="/terms" className="transition-colors hover:text-emerald-300 focus-visible:text-emerald-300">Terms</Link><span aria-hidden="true">·</span><Link to="/cancellation-policy" className="transition-colors hover:text-emerald-300 focus-visible:text-emerald-300">Cancellation policy</Link></nav></div>
    </div>
  </footer>
);
