import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError, ghs } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Footer } from "../components/Footer";
import { TrustBadges } from "../components/TrustBadges";
import { Button } from "../components/ui/button";
import { Calendar } from "../components/ui/calendar";
import { Separator } from "../components/ui/separator";
import { Star, MapPin, Check, ShieldCheck, Zap, AlertTriangle, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

const PACKAGE_HOURS = [3, 6, 12, 15, 24];

export default function TurfProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [turf, setTurf] = useState(null);
  const [date, setDate] = useState(new Date());
  const [avail, setAvail] = useState(null);
  const [startHour, setStartHour] = useState(null);
  const [duration, setDuration] = useState(1);
  const [isPackage, setIsPackage] = useState(false);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);

  const dateStr = date.toISOString().slice(0, 10);

  useEffect(() => { api.get(`/turfs/${id}`).then((r) => setTurf(r.data)); }, [id]);

  const loadAvail = useCallback(() => {
    api.get(`/turfs/${id}/availability`, { params: { date: dateStr } }).then((r) => { setAvail(r.data); setStartHour(null); });
  }, [id, dateStr]);
  useEffect(() => { loadAvail(); }, [loadAvail]);

  useEffect(() => {
    if (startHour == null) { setQuote(null); return; }
    api.get(`/turfs/${id}/quote`, { params: { date: dateStr, start_hour: startHour, duration, is_package: isPackage } })
      .then((r) => setQuote(r.data));
  }, [id, dateStr, startHour, duration, isPackage]);

  if (!turf) return <div className="max-w-7xl mx-auto px-5 py-20 text-muted-foreground">Loading turf…</div>;

  const hours = [];
  if (avail) for (let h = avail.open_hour; h < avail.close_hour; h++) hours.push(h);
  const isBooked = (h) => avail?.booked_hours.includes(h);
  const isPeak = (h) => avail?.peak_hours.includes(h);
  // slots occupied by the current selection
  const selected = (h) => startHour != null && h >= startHour && h < startHour + duration;
  const selectionValid = startHour != null && (startHour + duration) <= (avail?.close_hour ?? 23) &&
    !Array.from({ length: duration }, (_, i) => startHour + i).some(isBooked);

  const pickHour = (h) => { if (!isBooked(h)) setStartHour(h); };
  const pickDuration = (d, pkg) => { setDuration(d); setIsPackage(pkg); };

  const book = async () => {
    if (!selectionValid) { toast.error("Please select a valid, available slot range"); return; }
    setBusy(true);
    try {
      const customer = user
        ? { name: user.name, email: user.email }
        : { name: "Guest", email: null };
      const payload = {
        turf_id: id, date: dateStr, start_hour: startHour, duration,
        is_package: isPackage, customer,
      };
      const { data } = await api.post("/bookings", payload);
      navigate(`/checkout/${data.id}`);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <div className="max-w-7xl mx-auto px-5 lg:px-8 py-6">
        <button onClick={() => navigate("/")} data-testid="back-btn" className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground mb-4">
          <ChevronLeft className="w-4 h-4" /> Back to discovery
        </button>

        <div className="grid lg:grid-cols-12 gap-8">
          {/* LEFT */}
          <div className="lg:col-span-8">
            <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[340px] sm:h-[420px] rounded-2xl overflow-hidden">
              <img src={turf.images[0]} alt={turf.name} className="col-span-4 sm:col-span-2 row-span-2 w-full h-full object-cover" />
              {turf.images.slice(1, 3).map((im, i) => (
                <img key={i} src={im} alt="" className="hidden sm:block col-span-2 w-full h-full object-cover" />
              ))}
            </div>

            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tight">{turf.name}</h1>
                {turf.rating && (
                  <span className="flex items-center gap-1 text-sm font-bold bg-primary text-primary-foreground px-2.5 py-1 rounded-full">
                    <Star className="w-3.5 h-3.5 fill-current" /> {turf.rating} ({turf.review_count})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground mt-2">
                <MapPin className="w-4 h-4" /> {turf.location}
              </div>
              <div className="flex gap-2 mt-3">
                <span className="text-xs font-bold uppercase bg-secondary px-2.5 py-1 rounded">{turf.turf_type}</span>
                <span className="text-xs font-bold uppercase bg-secondary px-2.5 py-1 rounded">{turf.playing_format}</span>
              </div>
              <p className="mt-4 text-muted-foreground leading-relaxed max-w-2xl">{turf.description}</p>
            </div>

            <Separator className="my-8" />
            <h2 className="font-display font-extrabold text-2xl mb-4">Amenities</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {turf.amenities.map((a) => (
                <div key={a} className="flex items-center gap-2 text-sm font-medium">
                  <span className="w-6 h-6 rounded-md bg-accent grid place-items-center"><Check className="w-3.5 h-3.5 text-primary" /></span>{a}
                </div>
              ))}
            </div>

            <Separator className="my-8" />
            <h2 className="font-display font-extrabold text-2xl mb-4">Pitch rules</h2>
            <ul className="space-y-2">
              {turf.rules.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-primary mt-0.5">•</span> {r}
                </li>
              ))}
            </ul>

            <Separator className="my-8" />
            <h2 className="font-display font-extrabold text-2xl mb-4">Reviews ({turf.review_count})</h2>
            {turf.reviews?.length ? (
              <div className="space-y-4">
                {turf.reviews.map((rv) => (
                  <div key={rv.id} className="bg-white border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{rv.author}</span>
                      <span className="flex items-center gap-0.5 text-amber-500 text-sm">
                        {Array.from({ length: rv.rating }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-current" />)}
                      </span>
                    </div>
                    {rv.comment && <p className="text-sm text-muted-foreground mt-1">{rv.comment}</p>}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No reviews yet. Be the first after you play!</p>}
          </div>

          {/* RIGHT — sticky booking widget */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-20 bg-white border border-border rounded-2xl p-5" data-testid="booking-widget">
              <div className="flex items-baseline gap-1 mb-1">
                <span className="font-display font-black text-3xl">{ghs(turf.base_hourly)}</span>
                <span className="text-sm text-muted-foreground font-semibold">/hr</span>
                <span className="ml-auto text-xs text-muted-foreground">Peak {ghs(turf.peak_hourly)} · Wknd {ghs(turf.weekend_hourly)}</span>
              </div>

              <Calendar
                mode="single" selected={date} onSelect={(d) => d && setDate(d)}
                disabled={{ before: new Date() }}
                className="rounded-md border border-border p-2 my-3"
              />

              <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">Select start slot</div>
              <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto no-scrollbar">
                {hours.map((h) => (
                  <button
                    key={h} data-testid={`slot-${h}`} onClick={() => pickHour(h)} disabled={isBooked(h)}
                    className={`slot-btn text-xs font-bold py-2 rounded-md border
                      ${isBooked(h) ? "bg-secondary text-muted-foreground/40 line-through cursor-not-allowed border-transparent"
                        : selected(h) ? "bg-primary text-primary-foreground border-primary"
                        : isPeak(h) ? "bg-amber-50 border-amber-200 text-amber-700 hover:border-primary"
                        : "bg-white border-border hover:border-primary"}`}
                  >
                    {String(h).padStart(2, "0")}:00
                  </button>
                ))}
              </div>

              <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mt-4 mb-2">Duration</div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2].map((d) => (
                  <button key={d} data-testid={`dur-${d}`} onClick={() => pickDuration(d, false)}
                    className={`text-xs font-bold px-3 py-2 rounded-md border ${!isPackage && duration === d ? "bg-primary text-primary-foreground border-primary" : "bg-white border-border hover:border-primary"}`}>
                    {d}h
                  </button>
                ))}
                {PACKAGE_HOURS.map((d) => (
                  <button key={d} data-testid={`pkg-${d}`} onClick={() => pickDuration(d, true)}
                    className={`text-xs font-bold px-3 py-2 rounded-md border ${isPackage && duration === d ? "bg-primary text-primary-foreground border-primary" : "bg-white border-border hover:border-primary"}`}>
                    {d}h pkg
                  </button>
                ))}
              </div>

              {quote && (
                <div className="mt-4 bg-secondary/60 rounded-lg p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Hourly total</span><span>{ghs(quote.hourly_total)}</span></div>
                  {quote.package_discount > 0 && (
                    <div className="flex justify-between text-primary font-semibold"><span>Package discount ({quote.package_discount_pct}%)</span><span>-{ghs(quote.package_discount)}</span></div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between font-display font-black text-lg"><span>Total</span><span>{ghs(quote.total)}</span></div>
                </div>
              )}

              <Button data-testid="book-now-btn" disabled={!selectionValid || busy} onClick={book}
                className="w-full mt-4 bg-primary hover:bg-primary/90 h-11 text-base font-bold">
                <Zap className="w-4 h-4 mr-1.5" /> {busy ? "Holding slot…" : startHour != null ? `Book ${String(startHour).padStart(2, "0")}:00 · ${duration}h` : "Select a slot"}
              </Button>

              <TrustBadges className="mt-4 justify-center" />

              <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span><strong>Refund policy:</strong> Full refund if you cancel within the first quarter of the time between booking and kickoff. After that, a GHS 30 penalty applies.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
