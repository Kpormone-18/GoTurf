import { LoadingScreen } from "../components/LoadingScreen";
import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { TurfCard } from "../components/TurfCard";
import { TurfMap } from "../components/TurfMap";
import { TrustBadges } from "../components/TrustBadges";
import { Footer } from "../components/Footer";
import { HeroArtwork } from "../components/HeroArtwork";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Search, MapPin, ArrowRight, LayoutGrid, Map as MapIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const AMENITIES = ["all", "Floodlights", "Changing Rooms", "Parking", "Showers", "Cafeteria", "Water", "Indoor", "Spectator Seating"];
const TYPES = ["all", "5-a-side", "7-a-side", "11-a-side", "Futsal"];

export default function Home() {
  const [turfs, setTurfs] = useState([]);
  const [hoods, setHoods] = useState([]);
  const [q, setQ] = useState("");
  const [neighborhood, setNeighborhood] = useState("all");
  const [turfType, setTurfType] = useState("all");
  const [amenity, setAmenity] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [view, setView] = useState("list");
  const reducedMotion = useReducedMotion();

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (neighborhood !== "all") params.neighborhood = neighborhood;
    if (turfType !== "all") params.turf_type = turfType;
    if (amenity !== "all") params.amenity = amenity;
    setLoadError(false);
    try {
      const { data } = await api.get("/turfs", { params });
      setTurfs(data);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [q, neighborhood, turfType, amenity]);

  useEffect(() => { api.get("/turfs/neighborhoods").then((r) => setHoods(r.data)).catch(() => setHoods([])); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div>
      {/* HERO */}
      <section id="hero" tabIndex={-1} className="goturf-hero relative overflow-hidden bg-[#06281f] text-white">
        <div className="relative mx-auto max-w-7xl px-5 py-10 sm:py-16 lg:px-8 lg:py-20">
          <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
          <HeroArtwork />
          <div className="relative max-w-3xl animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-[0.16em] text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Football pitch marketplace
            </div>
            <h1 className="mt-6 font-display text-[clamp(2.75rem,6vw,5.5rem)] font-black leading-[0.98] tracking-tight">
              Your pitch.<br />Your people.<br /><span className="text-emerald-300">Your game.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-white/75">
              Discover standout pitches, reserve a live slot in minutes, and arrive ready to play.
            </p>
            <a href="#discover" className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-lg bg-emerald-300 px-5 py-3 text-sm font-bold text-[#06281f] transition-colors hover:bg-emerald-200">Explore pitches <ArrowRight className="h-4 w-4" /></a>
            <TrustBadges className="mt-6" />
          </div>
          </div>

          {/* SEARCH BAR */}
          <div className="relative mt-10 grid gap-3 rounded-xl border border-white/20 bg-white p-3 shadow-xl shadow-black/20 sm:grid-cols-[1fr_auto]">
            <div className="flex items-center gap-2 px-3">
              <Search className="w-5 h-5 text-muted-foreground shrink-0" />
              <Input
                aria-label="Search pitches by name or area" data-testid="home-search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search turf name or area…"
                className="border-0 shadow-none focus-visible:ring-0 text-foreground text-base px-0"
              />
            </div>
            <Select value={neighborhood} onValueChange={setNeighborhood}>
              <SelectTrigger aria-label="Filter by area" data-testid="home-hood-select" className="min-w-[160px] border-border text-foreground">
                <MapPin className="w-4 h-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locations</SelectItem>
                {hoods.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* FILTERS + GRID */}
      <section id="discover" className="max-w-7xl mx-auto px-5 lg:px-8 py-12">
        <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">The marketplace</p><h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Find your home ground.</h2><p className="mt-2 text-sm text-muted-foreground">Compare pitches, check availability, and choose your next kickoff.</p></div>
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <Select value={turfType} onValueChange={setTurfType}>
            <SelectTrigger aria-label="Filter by pitch format" data-testid="filter-type" className="w-full sm:w-[150px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t === "all" ? "All formats" : t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={amenity} onValueChange={setAmenity}>
            <SelectTrigger aria-label="Filter by amenity" data-testid="filter-amenity" className="w-full sm:w-[170px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{AMENITIES.map((a) => <SelectItem key={a} value={a}>{a === "all" ? "All amenities" : a}</SelectItem>)}</SelectContent>
          </Select>
          {(turfType !== "all" || amenity !== "all" || neighborhood !== "all" || q) && (
            <Button variant="ghost" size="sm" data-testid="clear-filters" onClick={() => { setQ(""); setNeighborhood("all"); setTurfType("all"); setAmenity("all"); }}>
              Clear filters
            </Button>
          )}
          <div className="flex w-full items-center justify-between gap-3 sm:ml-auto sm:w-auto">
            <div className="flex items-center rounded-lg border border-border bg-white p-0.5 shadow-sm">
              <button aria-pressed={view === "list"} data-testid="view-list" onClick={() => setView("list")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all duration-300 ${view === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>
                <LayoutGrid className="w-3.5 h-3.5" /> List
              </button>
              <button aria-pressed={view === "map"} data-testid="view-map" onClick={() => setView("map")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-all duration-300 ${view === "map" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"}`}>
                <MapIcon className="w-3.5 h-3.5" /> Map
              </button>
            </div>
            <div className="text-sm text-muted-foreground font-semibold" data-testid="turf-count">
              {loading ? "Searching…" : `${turfs.length} turf${turfs.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={loading ? "loading" : loadError ? "error" : view} initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
            {loading ? <LoadingScreen inline label="Finding your pitch" /> : loadError ? (
              <div className="py-16 text-center"><p>We couldn’t load the pitches.</p><Button onClick={load} className="mt-4">Try again</Button></div>
            ) : view === "map" ? (
              <TurfMap turfs={turfs} />
            ) : turfs.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <p className="text-lg font-semibold">No turfs match your search.</p>
                <p className="text-sm">Try clearing filters or searching another area.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {turfs.map((t) => <TurfCard key={t.id} turf={t} className="animate-fade-up" />)}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* HOW IT WORKS */}
      <section className="relative overflow-hidden bg-[#06281f] text-white">
        <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
        <div className="pointer-events-none absolute right-0 bottom-0 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 py-20 lg:px-8">
          <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">How GoTurf works</p><h2 className="mt-4 font-display text-3xl font-black tracking-tight sm:text-5xl">From pitch search to kickoff, in a few clear steps.</h2><p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">Find a place that fits the squad, lock in a live slot, and play knowing every booking is protected.</p></div>
          <div className="relative mt-12 grid gap-5 md:grid-cols-3 md:gap-6"><div className="absolute left-[16.5%] right-[16.5%] top-10 hidden border-t border-emerald-300/25 md:block" />
            {[
              ["Find your pitch", "Compare locations, formats and amenities to find your team’s perfect match.", "01"],
              ["Pick a live slot", "See real-time availability and clear pricing before you commit to your game time.", "02"],
              ["Pay & play", "Confirm securely, receive your booking instantly, and focus on the football.", "03"],
            ].map(([t, d, n]) => (
              <article key={t} className="relative rounded-2xl border border-white/15 bg-white/[0.06] p-6 backdrop-blur-sm"><div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-300 font-display text-sm font-black text-[#06281f] shadow-[0_0_0_8px_rgba(6,40,31,0.7)]">{n}</div><h3 className="mt-7 font-display text-xl font-black">{t}</h3><p className="mt-3 text-sm leading-relaxed text-white/70">{d}</p><ArrowRight className="mt-6 h-4 w-4 text-emerald-300" /></article>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
