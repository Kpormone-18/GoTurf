import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { TurfCard } from "../components/TurfCard";
import { TurfMap } from "../components/TurfMap";
import { TrustBadges } from "../components/TrustBadges";
import { Footer } from "../components/Footer";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Search, MapPin, ArrowRight, LayoutGrid, Map as MapIcon } from "lucide-react";

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
  const [view, setView] = useState("list");

  const load = useCallback(async () => {
    setLoading(true);
    const params = {};
    if (q) params.q = q;
    if (neighborhood !== "all") params.neighborhood = neighborhood;
    if (turfType !== "all") params.turf_type = turfType;
    if (amenity !== "all") params.amenity = amenity;
    const { data } = await api.get("/turfs", { params });
    setTurfs(data);
    setLoading(false);
  }, [q, neighborhood, turfType, amenity]);

  useEffect(() => { api.get("/turfs/neighborhoods").then((r) => setHoods(r.data)); }, []);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-[#0B1120] text-white">
        <img
          src="https://images.unsplash.com/photo-1487466365202-1afdb86c764e?crop=entropy&cs=srgb&fm=jpg&q=85&w=1920"
          alt="Floodlit pitch at night in Accra"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1120] via-[#0B1120]/70 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-5 lg:px-8 py-20 lg:py-28">
          <div className="max-w-2xl animate-fade-up">
            <div className="text-xs uppercase tracking-[0.25em] font-bold text-emerald-400 mb-4">
              Accra&apos;s AstroTurf marketplace
            </div>
            <h1 className="font-display font-black text-4xl sm:text-5xl lg:text-6xl tracking-tighter leading-[0.95]">
              Book your pitch.<br />Play in minutes.
            </h1>
            <p className="mt-5 text-lg text-slate-300 max-w-xl leading-relaxed">
              Discover, compare and book floodlit AstroTurf across Accra. Instant confirmation,
              escrow-protected payment, no more double bookings.
            </p>
            <TrustBadges className="mt-6" />
          </div>

          {/* SEARCH BAR */}
          <div className="relative mt-10 bg-white rounded-2xl p-3 shadow-2xl grid sm:grid-cols-[1fr_auto] gap-3 max-w-3xl animate-fade-up" style={{ animationDelay: ".1s" }}>
            <div className="flex items-center gap-2 px-3">
              <Search className="w-5 h-5 text-muted-foreground shrink-0" />
              <Input
                data-testid="home-search-input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search turf name or area in Accra…"
                className="border-0 shadow-none focus-visible:ring-0 text-foreground text-base px-0"
              />
            </div>
            <Select value={neighborhood} onValueChange={setNeighborhood}>
              <SelectTrigger data-testid="home-hood-select" className="min-w-[160px] border-border text-foreground">
                <MapPin className="w-4 h-4 mr-1 text-muted-foreground" />
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All of Accra</SelectItem>
                {hoods.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* FILTERS + GRID */}
      <section className="max-w-7xl mx-auto px-5 lg:px-8 py-12">
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <Select value={turfType} onValueChange={setTurfType}>
            <SelectTrigger data-testid="filter-type" className="w-[150px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t === "all" ? "All formats" : t}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={amenity} onValueChange={setAmenity}>
            <SelectTrigger data-testid="filter-amenity" className="w-[170px] bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>{AMENITIES.map((a) => <SelectItem key={a} value={a}>{a === "all" ? "All amenities" : a}</SelectItem>)}</SelectContent>
          </Select>
          {(turfType !== "all" || amenity !== "all" || neighborhood !== "all" || q) && (
            <Button variant="ghost" size="sm" data-testid="clear-filters" onClick={() => { setQ(""); setNeighborhood("all"); setTurfType("all"); setAmenity("all"); }}>
              Clear filters
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-border bg-white p-0.5">
              <button data-testid="view-list" onClick={() => setView("list")}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <LayoutGrid className="w-3.5 h-3.5" /> List
              </button>
              <button data-testid="view-map" onClick={() => setView("map")}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-md ${view === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                <MapIcon className="w-3.5 h-3.5" /> Map
              </button>
            </div>
            <div className="text-sm text-muted-foreground font-semibold hidden sm:block" data-testid="turf-count">
              {loading ? "Searching…" : `${turfs.length} turf${turfs.length === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>

        {view === "map" ? (
          <TurfMap turfs={turfs} />
        ) : turfs.length === 0 && !loading ? (
          <div className="text-center py-20 text-muted-foreground">
            <p className="text-lg font-semibold">No turfs match your search.</p>
            <p className="text-sm">Try clearing filters or searching another area.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {turfs.map((t, i) => (
              <TurfCard key={t.id} turf={t} className={`animate-fade-up ${i === 0 ? "sm:col-span-2 lg:col-span-1" : ""}`} />
            ))}
          </div>
        )}
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-white border-y border-border">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-16 grid md:grid-cols-3 gap-8">
          {[
            ["Find your pitch", "Filter by area, format and amenities across Accra."],
            ["Pick a live slot", "See real-time availability and transparent pricing instantly."],
            ["Pay & play", "Funds held in escrow, released to the owner only after you play."],
          ].map(([t, d], i) => (
            <div key={t} className="flex gap-4">
              <div className="w-10 h-10 shrink-0 rounded-lg bg-primary text-primary-foreground grid place-items-center font-display font-black">{i + 1}</div>
              <div>
                <h3 className="font-display font-bold text-xl flex items-center gap-1">{t} <ArrowRight className="w-4 h-4 text-primary" /></h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
