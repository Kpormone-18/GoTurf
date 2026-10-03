import { PageError } from "../components/PageError";
import { LoadingScreen } from "../components/LoadingScreen";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError, ghs } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Footer } from "../components/Footer";
import { TrustBadges } from "../components/TrustBadges";
import { TurfGallery } from "../components/TurfGallery";
import { Button } from "../components/ui/button";
import { Calendar } from "../components/ui/calendar";
import { Separator } from "../components/ui/separator";
import { Star, MapPin, Check, Zap, ChevronLeft, ExternalLink, Clock3 } from "lucide-react";
import { toast } from "sonner";
import { buildBookingSchedule, dateForCalendar, dateLabel, hoursLabel } from "../lib/bookingSchedule";

export default function TurfProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isOwnerPreview = searchParams.get("preview") === "owner";
  const { user } = useAuth();
  const [loadError, setLoadError] = useState(false);
  const [turf, setTurf] = useState(null);
  const [date, setDate] = useState(new Date());
  const [avail, setAvail] = useState(null);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [continuationAvailability, setContinuationAvailability] = useState({});
  const [startHour, setStartHour] = useState(null);
  const [duration, setDuration] = useState(1);
  const [isPackage, setIsPackage] = useState(false);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);

  const dateStr = date.toISOString().slice(0, 10);

  useEffect(() => { api.get(`/turfs/${id}`).then((r) => setTurf(r.data)).catch(() => setLoadError(true)); }, [id]);

  const loadAvail = useCallback(() => {
    setAvail(null); setStartHour(null); setAvailabilityError(false);
    api.get(`/turfs/${id}/availability`, { params: { date: dateStr } }).then((r) => setAvail(r.data)).catch(() => setAvailabilityError(true));
  }, [id, dateStr]);
  useEffect(() => { loadAvail(); }, [loadAvail]);

  const schedule = useMemo(() => buildBookingSchedule({
    date: dateStr, startHour, duration, openHour: avail?.open_hour, closeHour: avail?.close_hour, is24Hour: turf?.is_24_hour,
  }), [dateStr, startHour, duration, avail?.open_hour, avail?.close_hour, turf?.is_24_hour]);
  const continuationDates = useMemo(() => schedule.slice(1).map((segment) => segment.date), [schedule]);

  useEffect(() => {
    if (!continuationDates.length) { setContinuationAvailability({}); return; }
    let current = true;
    setContinuationAvailability({});
    Promise.all(continuationDates.map(async (continuationDate) => {
      const { data } = await api.get(`/turfs/${id}/availability`, { params: { date: continuationDate } });
      return [continuationDate, data];
    })).then((entries) => {
      if (current) setContinuationAvailability(Object.fromEntries(entries));
    }).catch(() => {
      if (current) setAvailabilityError(true);
    });
    return () => { current = false; };
  }, [id, continuationDates.join(",")]);

  useEffect(() => {
    if (startHour == null || (!turf?.is_24_hour && startHour + duration > (avail?.close_hour ?? 0))) { setQuote(null); return; }
    api.get(`/turfs/${id}/quote`, { params: { date: dateStr, start_hour: startHour, duration, is_package: isPackage } })
      .then((r) => setQuote(r.data)).catch(() => { setQuote(null); toast.error("Could not load the price. Please select your slot again."); });
  }, [id, dateStr, startHour, duration, isPackage, turf?.is_24_hour, avail?.close_hour]);

  if (loadError) return <PageError />;
  if (!turf) return <LoadingScreen />;

  const hours = [];
  if (avail) for (let h = avail.open_hour; h < avail.close_hour; h++) hours.push(h);
  const isBooked = (h) => avail?.booked_hours.includes(h);
  const isPeak = (h) => avail?.peak_hours.includes(h);
  // Current-day slots are shown in the grid; continuation is surfaced below it.
  const selected = (h) => startHour != null && h >= startHour && h < startHour + duration;
  const extendsPastClosing = startHour != null && !turf.is_24_hour && startHour + duration > (avail?.close_hour ?? 24);
  const selectionValid = !extendsPastClosing && schedule.length > 0 && schedule.every((segment) => {
    const dayAvailability = segment.date === dateStr ? avail : continuationAvailability[segment.date];
    return dayAvailability && !Array.from({ length: segment.endHour - segment.startHour }, (_, index) => segment.startHour + index)
      .some((hour) => dayAvailability.booked_hours.includes(hour));
  });

  const pickHour = (h) => { if (!isBooked(h)) setStartHour(h); };
  const pickDuration = (d, pkg) => { setDuration(d); setIsPackage(pkg); };
  const directionsUrl = turf.map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(turf.lat != null && turf.lng != null ? `${turf.lat},${turf.lng}` : turf.location)}`;
  const packages = turf.packages?.length ? turf.packages : [{ hours: 3 }, { hours: 6 }, { hours: 12 }, { hours: 15 }, { hours: 24 }];

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

  if (busy) return <LoadingScreen label="Preparing your booking" />;

  return (
    <div className={isOwnerPreview ? "" : "pb-24 lg:pb-0"}>
      <div className="max-w-7xl mx-auto px-5 lg:px-8 py-6">
        {!isOwnerPreview && <button onClick={() => navigate("/")} data-testid="back-btn" className="group mb-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white py-1.5 pl-1.5 pr-4 text-sm font-bold text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-primary focus-visible:outline-none">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary transition group-hover:bg-accent"><ChevronLeft className="h-4 w-4" /></span> Back to discovery
        </button>}

        <div className="grid lg:grid-cols-12 gap-8">
          {/* LEFT */}
          <div className="min-w-0 lg:col-span-8">
            <TurfGallery images={turf.images} name={turf.name} />

            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tight">{turf.name}</h1>
                {turf.rating && (
                  <span className="flex items-center gap-1 text-sm font-bold bg-primary text-primary-foreground px-2.5 py-1 rounded-full">
                    <Star className="w-3.5 h-3.5 fill-current" /> {turf.rating} ({turf.review_count})
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-muted-foreground">
                <MapPin className="w-4 h-4" />
                <a href={directionsUrl} target="_blank" rel="noreferrer" className="font-medium underline decoration-primary/40 underline-offset-4 hover:text-primary">{turf.location}</a>
                <a href={directionsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-xs font-semibold text-foreground hover:border-primary hover:text-primary"><ExternalLink className="h-3.5 w-3.5" /> Directions</a>
              </div>
              <div className="flex gap-2 mt-3">
                <span className="text-xs font-bold uppercase bg-secondary px-2.5 py-1 rounded">{turf.turf_type}</span>
                <span className="text-xs font-bold uppercase bg-secondary px-2.5 py-1 rounded">{turf.playing_format}</span>
              </div>
              <p className="mt-4 text-muted-foreground leading-relaxed max-w-2xl">{turf.description}</p>
              <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground"><Clock3 className="h-4 w-4 text-primary" /> {turf.is_24_hour ? <><span>Open</span><span className="font-bold text-foreground">24 hours</span></> : <>Open daily <span className="font-bold text-foreground">{String(turf.open_hour).padStart(2, "0")}:00–{String(turf.close_hour).padStart(2, "0")}:00</span></>}</div>
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

            {turf.event_bookings && <><Separator className="my-8" /><section className="rounded-xl border border-primary/20 bg-accent/45 p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Beyond match day</p><h2 className="mt-2 font-display text-2xl font-extrabold">Private events welcome</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{turf.event_details || "Contact venue for private events, group bookings and special arrangements."}</p></section></>}

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

          {/* RIGHT — booking widget */}
          <div className="min-w-0 lg:col-span-4">
            <div id="reserve-pitch" role="region" aria-label="Reserve this pitch" className="scroll-mt-4 bg-white border border-border rounded-2xl p-4 sm:p-6 shadow-sm" data-testid="booking-widget">
              <div className="border-b border-border pb-5">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Reserve this pitch</p>
                <div className="mt-2 space-y-4">
                  <div><p className="text-xs font-semibold text-muted-foreground">Standard rate</p><span className="whitespace-nowrap font-display text-4xl font-black tracking-tight text-foreground">{ghs(turf.base_hourly)}</span><span className="ml-1 whitespace-nowrap text-sm font-semibold text-muted-foreground">/ hr</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-xs font-bold text-amber-700">Peak rate</p><p className="mt-0.5 text-sm font-black text-amber-800">{ghs(turf.peak_hourly)} <span className="font-medium">/ hr</span></p></div>
                    <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2"><p className="whitespace-nowrap text-xs font-bold text-slate-600">Weekend rate</p><p className="mt-0.5 whitespace-nowrap text-sm font-black text-slate-800">{ghs(turf.weekend_hourly)} <span className="font-medium">/ hr</span></p></div>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs uppercase tracking-[0.16em] font-bold text-muted-foreground">1. Select date</div>
              <Calendar
                mode="single" selected={date} onSelect={(d) => !isOwnerPreview && d && setDate(d)}
                disabled={isOwnerPreview || { before: new Date() }}
                modifiers={{ continuation: continuationDates.map(dateForCalendar) }}
                modifiersClassNames={{ continuation: "bg-emerald-100 text-primary font-bold rounded-md" }}
                className="my-3 w-full rounded-md border border-border p-3"
                classNames={{
                  months: "w-full",
                  month: "w-full space-y-4",
                  head_cell: "flex-1 text-center text-muted-foreground font-normal text-[0.8rem]",
                  cell: "relative flex-1 p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent [&:has([aria-selected])]:rounded-md",
                  day: "h-10 w-full p-0 font-normal aria-selected:opacity-100",
                }}
              />

              <div className="mt-7 flex flex-wrap gap-2 items-center justify-between border-t border-border pt-6 text-xs uppercase tracking-[0.16em] font-bold text-muted-foreground"><span>2. Select start slot</span><span className="normal-case tracking-normal font-medium">Peak slots in amber</span></div>
              {turf.is_24_hour && <p className="mt-2 text-xs font-semibold text-primary">Open 24/7 · reservations may continue past midnight.</p>}
              {availabilityError ? <p role="alert" className="mt-3 text-sm">Availability couldn’t be loaded. <button onClick={loadAvail} className="text-primary font-bold underline">Try again</button></p> : !avail && <p role="status" className="mt-3 text-sm text-muted-foreground">Checking available times…</p>}
              <div className="mt-3 grid grid-cols-4 gap-2">
                {hours.map((h) => (
                  <button
                    key={h} aria-pressed={selected(h)} aria-label={`${String(h).padStart(2, "0")}:00${isBooked(h) ? ", unavailable" : isPeak(h) ? ", peak rate" : ""}`} data-testid={`slot-${h}`} onClick={() => !isOwnerPreview && pickHour(h)} disabled={isOwnerPreview || isBooked(h)}
                    className={`slot-btn min-h-11 text-xs font-bold py-2 rounded-md border
                      ${isBooked(h) ? "bg-red-50 border-red-200 text-red-700 line-through cursor-not-allowed"
                        : selected(h) ? "bg-primary text-primary-foreground border-primary"
                        : isPeak(h) ? "bg-amber-50 border-amber-200 text-amber-700 hover:border-primary"
                        : isOwnerPreview ? "bg-secondary text-muted-foreground/50 cursor-not-allowed border-transparent"
                        : "bg-white border-border hover:border-primary"}`}
                  >
                    {String(h).padStart(2, "0")}:00
                  </button>
                ))}
              </div>

              <div className="mt-7 border-t border-border pt-6 text-xs uppercase tracking-[0.16em] font-bold text-muted-foreground mb-3">3. Choose duration</div>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2].map((d) => (
                  <button key={d} aria-pressed={!isPackage && duration === d} data-testid={`dur-${d}`} disabled={isOwnerPreview} onClick={() => pickDuration(d, false)}
                    className={`text-xs font-bold px-3 py-2 rounded-md border ${!isPackage && duration === d ? "bg-primary text-primary-foreground border-primary" : "bg-white border-border hover:border-primary"}`}>
                    {d}h
                  </button>
                ))}
                {packages.map((pkg) => (
                  <button key={pkg.hours} aria-pressed={isPackage && duration === pkg.hours} data-testid={`pkg-${pkg.hours}`} disabled={isOwnerPreview} onClick={() => pickDuration(pkg.hours, true)}
                    className={`text-xs font-bold px-3 py-2 rounded-md border ${isPackage && duration === pkg.hours ? "bg-primary text-primary-foreground border-primary" : "bg-white border-border hover:border-primary"}`}>
                    {pkg.hours}h pkg{pkg.discount_pct ? ` · ${pkg.discount_pct}% off` : ""}
                  </button>
                ))}
              </div>

              {extendsPastClosing && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span className="font-bold">This pitch closes at {hoursLabel(avail?.close_hour ?? turf.close_hour)}.</span> Choose a shorter duration, or select a pitch marked open 24/7.</div>}

              {schedule.length > 0 && (
                <div className="mt-4 rounded-lg border border-primary/20 bg-accent/50 p-3" aria-live="polite">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Your reservation schedule</p>
                  <div className="mt-2 space-y-2">
                    {schedule.map((segment, index) => (
                      <div key={segment.date} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-foreground">{index ? `Next day · ${dateLabel(segment.date)}` : dateLabel(segment.date)}</span>
                        <span className="whitespace-nowrap font-bold text-primary">{hoursLabel(segment.startHour)}–{hoursLabel(segment.endHour)}</span>
                      </div>
                    ))}
                  </div>
                  {schedule.length > 1 && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">This 24/7 reservation continues at midnight into the following day.</p>}
                </div>
              )}

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

              <Button data-testid="book-now-btn" disabled={isOwnerPreview || !selectionValid || busy} onClick={book}
                className="w-full mt-4 bg-primary hover:bg-primary/90 h-11 text-base font-bold">
                <Zap className="w-4 h-4 mr-1.5" /> {isOwnerPreview ? "View-only preview" : busy ? "Holding slot…" : startHour != null ? `Book ${hoursLabel(startHour)} · ${duration}h${schedule.length > 1 ? " across days" : ""}` : "Select a slot"}
              </Button>

              <TrustBadges detailed className="mt-4" />
            </div>
          </div>
        </div>
      </div>
      {!isOwnerPreview && <Footer />}
      {!isOwnerPreview && <div className="mobile-reserve-bar fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-white px-5 py-3 shadow-lg lg:hidden"><div><p className="text-xs text-muted-foreground">Standard rate</p><p className="font-bold">{ghs(turf.base_hourly)} <span className="text-xs font-normal text-muted-foreground">/ hr</span></p></div><a href="#reserve-pitch" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-white">Check availability</a></div>}
    </div>
  );
}
