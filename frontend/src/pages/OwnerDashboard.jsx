import { PageError } from "../components/PageError";
import { LoadingScreen } from "../components/LoadingScreen";
import { BookingChatDialog } from "../components/BookingChatDialog";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError, ghs } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Wallet, CalendarCheck, Building2, AlertTriangle, Plus, BadgeCheck, Upload, ShieldAlert, Landmark, ImagePlus, X, LayoutDashboard, CalendarDays, TrendingUp, MoreHorizontal, MessageCircle } from "lucide-react";

const PEAK_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function BookingActions({ booking, decide, ownerCancel, compact = false }) {
  if (compact) return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button size="icon" variant="outline" className="h-9 w-9 rounded-full" aria-label={`Actions for ${booking.reference}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-48">
      <BookingChatDialog booking={booking} trigger={<DropdownMenuItem onSelect={(event) => event.preventDefault()}><MessageCircle className="mr-2 h-4 w-4" />Message customer</DropdownMenuItem>} />
      {booking.reschedule_request?.status === "pending" && <><DropdownMenuItem onSelect={() => decide(booking, true)}>Approve reschedule</DropdownMenuItem><DropdownMenuItem onSelect={() => decide(booking, false)}>Decline reschedule</DropdownMenuItem></>}
      {booking.status === "confirmed" && <OwnerCancelDialog booking={booking} onCancel={ownerCancel} trigger={<DropdownMenuItem onSelect={(event) => event.preventDefault()} className="text-destructive focus:bg-destructive/10 focus:text-destructive">Cancel booking</DropdownMenuItem>} />}
    </DropdownMenuContent>
  </DropdownMenu>;
  return <div className="flex flex-wrap justify-end gap-2">
    <BookingChatDialog booking={booking} />
    {booking.reschedule_request?.status === "pending" && <><Button size="sm" variant="outline" data-testid={`rs-approve-${booking.id}`} onClick={() => decide(booking, true)}>Approve</Button><Button size="sm" variant="ghost" data-testid={`rs-reject-${booking.id}`} onClick={() => decide(booking, false)}>Reject</Button></>}
    {booking.status === "confirmed" && <OwnerCancelDialog booking={booking} onCancel={ownerCancel} />}
  </div>;
}

function OwnerCancelDialog({ booking, onCancel, trigger }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [understandsPenalty, setUnderstandsPenalty] = useState(false);
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const cancellationReason = reason === "Other" ? otherReason.trim() : reason;
  const canCancel = new Date(booking.start_datetime).getTime() - Date.now() > 30 * 60 * 1000;
  const close = (next) => { setOpen(next); if (!next) setStep(1); };
  if (!canCancel) return trigger ? null : <span title="Bookings cannot be cancelled within 30 minutes of kickoff"><Button size="sm" variant="destructive" disabled>Cancel</Button></span>;
  return <Dialog open={open} onOpenChange={close}>
    <DialogTrigger asChild>{trigger || <Button size="sm" variant="destructive" data-testid={`owner-cancel-${booking.id}`}>Cancel</Button>}</DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>{step === 1 ? "Why cancel this booking?" : "Confirm cancellation"}</DialogTitle></DialogHeader>
      {step === 1 ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Tell the customer what changed. This message appears in their refund confirmation.</p><select aria-label="Cancellation reason" value={reason} onChange={(event) => setReason(event.target.value)} className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select a reason</option><option>Facility issue</option><option>Unexpected closure</option><option>Scheduling conflict</option><option>Staffing issue</option><option>Other</option></select>{reason === "Other" && <textarea aria-label="Cancellation details" value={otherReason} onChange={(event) => setOtherReason(event.target.value)} maxLength={1000} rows={3} placeholder="Explain the cancellation" className="w-full rounded-md border border-input p-3 text-sm" />}</div> : <div className="space-y-4"><div className="rounded-lg border border-border bg-secondary/50 p-3 text-sm"><p className="font-semibold">Customer refund</p><p className="mt-1 text-muted-foreground">{ghs(booking.amount_paid || booking.total)} will be returned to the original payment method.</p></div><p className="text-sm text-muted-foreground">Reason: <span className="font-medium text-foreground">{cancellationReason}</span></p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={understandsPenalty} onChange={(event) => setUnderstandsPenalty(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />I understand this cancellation may count against my owner account.</label><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={acceptsTerms} onChange={(event) => setAcceptsTerms(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />I accept GoTurf cancellation terms.</label></div>}
      <DialogFooter>{step === 1 ? <Button disabled={!cancellationReason} onClick={() => setStep(2)} className="bg-primary hover:bg-primary/90">Continue</Button> : <><Button variant="outline" onClick={() => setStep(1)}>Back</Button><Button variant="destructive" disabled={!understandsPenalty || !acceptsTerms} onClick={() => onCancel(booking, { reason: cancellationReason, understands_penalty: understandsPenalty, accepts_terms: acceptsTerms }).then(() => close(false))}>Confirm cancellation</Button></>}</DialogFooter>
    </DialogContent>
  </Dialog>;
}

export default function OwnerDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loadError, setLoadError] = useState(false);
  const [ov, setOv] = useState(null);
  const [turfs, setTurfs] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [previewTurf, setPreviewTurf] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([api.get("/owner/overview"), api.get("/owner/turfs"), api.get("/owner/bookings")])
      .then(([overview, pitches, activity]) => { setOv(overview.data); setTurfs(pitches.data); setBookings(activity.data); })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user || !["owner", "admin"].includes(user.role)) { navigate("/owner/login"); return; }
    load();
  }, [user, loading, navigate, load]);

  const decide = async (b, approve) => {
    try { await api.post(`/owner/bookings/${b.id}/reschedule-decision?approve=${approve}`); toast.success(`Reschedule ${approve ? "approved" : "rejected"}`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const ownerCancel = async (b, payload) => {
    try { const { data } = await api.post(`/owner/bookings/${b.id}/cancel`, payload); toast.warning(`Cancelled. Strike #${data.strikes} issued.`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const analytics = useMemo(() => {
    const statusCounts = bookings.reduce((counts, booking) => ({ ...counts, [booking.status]: (counts[booking.status] || 0) + 1 }), {});
    const byDate = bookings.reduce((totals, booking) => {
      const date = booking.date || "Upcoming";
      totals[date] = (totals[date] || 0) + Number(booking.amount_paid || booking.total || 0);
      return totals;
    }, {});
    const revenueTrend = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([date, revenue]) => ({ date: date.slice(5), revenue }));
    return {
      revenueTrend: revenueTrend.length ? revenueTrend : [{ date: "No activity", revenue: 0 }],
      confirmed: statusCounts.confirmed || 0,
      pending: (statusCounts.pending_payment || 0) + (statusCounts.pending || 0),
      cancelled: (statusCounts.cancelled_by_owner || 0) + (statusCounts.cancelled || 0),
    };
  }, [bookings]);
  if (loadError) return <PageError />;
  if (!ov) return <LoadingScreen />;
  const editorRequested = searchParams.has("turf-editor");
  const editingTurf = turfs.find((turf) => turf.id === searchParams.get("turf-editor"));
  if (editorRequested) return <TurfDialog editor turf={editingTurf} onDone={() => { load(); navigate("/owner"); }} />;
  const suspended = ov.suspended_until && new Date(ov.suspended_until) > new Date();
  const verified = ov.verified;

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl">Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}.</h1><p className="mt-2 text-sm text-muted-foreground">A clear view of your bookings, listings and payouts.</p></div><section className="min-w-[220px] rounded-2xl border border-border/80 bg-white px-5 py-4 shadow-[0_12px_30px_-24px_rgba(6,40,31,0.55)] transition-shadow duration-300 hover:shadow-[0_18px_34px_-22px_rgba(6,40,31,0.65)]" aria-label="Marketplace portfolio"><div className="flex items-center justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Portfolio</p><p className="mt-2 font-display text-3xl font-black leading-none">{turfs.length}</p></div><div className="grid h-10 w-10 place-items-center rounded-full bg-accent text-primary"><Building2 className="h-5 w-5" /></div></div><p className="mt-2 text-xs font-medium text-muted-foreground">Active listing{turfs.length === 1 ? "" : "s"} ready for customers</p></section></div>

      {suspended && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-2 text-sm font-semibold text-red-700">
          <AlertTriangle className="w-5 h-5" /> Your account is suspended until {new Date(ov.suspended_until).toLocaleDateString()} due to repeated cancellations.
        </div>
      )}

      {!verified && (
        <section className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="verify-banner" aria-label="Verification required">
          <div className="flex items-start gap-3"><span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800"><ShieldAlert className="h-4 w-4" /></span><div><p className="text-sm font-bold text-amber-950">Verification required before publishing</p><p className="mt-0.5 text-sm text-amber-900/75">Complete your Ghana Card review to make new turf listings visible to customers.</p></div></div>
          <Button size="sm" variant="outline" onClick={() => setActiveTab("verification")} className="border-amber-300 bg-white text-amber-950 hover:bg-amber-100">Review verification <span className="ml-1 text-xs font-medium uppercase">{statusLabel(ov.verification_status)}</span></Button>
        </section>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        <aside className="mb-6 lg:mb-0 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl bg-[#06281f] p-3 shadow-sm"><p className="px-3 pb-2 pt-2 text-sm text-white/60">Your operations</p>
          <TabsList className="mt-1 flex h-auto w-full items-center gap-1 overflow-x-auto bg-transparent p-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:items-stretch lg:overflow-visible lg:pb-0">
            <TabsTrigger value="overview" className="shrink-0 justify-center gap-2 text-white/70 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none lg:w-full lg:justify-start"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
            <TabsTrigger value="bookings" data-testid="owner-tab-bookings" className="shrink-0 justify-center gap-2 text-white/70 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none lg:w-full lg:justify-start"><CalendarDays className="h-4 w-4" />Bookings</TabsTrigger>
            <TabsTrigger value="turfs" data-testid="owner-tab-turfs" className="shrink-0 justify-center gap-2 text-white/70 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none lg:w-full lg:justify-start"><Building2 className="h-4 w-4" />My turfs</TabsTrigger>
            <TabsTrigger value="payouts" data-testid="owner-tab-payouts" className="shrink-0 justify-center gap-2 text-white/70 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none lg:w-full lg:justify-start"><Wallet className="h-4 w-4" />Payouts</TabsTrigger>
            <TabsTrigger value="verification" data-testid="owner-tab-verification" className="shrink-0 justify-center gap-2 text-white/70 data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:shadow-none lg:w-full lg:justify-start"><BadgeCheck className="h-4 w-4" />Verification</TabsTrigger>
          </TabsList>
          </div>
        </aside>
        <div className="min-w-0">
        <TabsContent value="overview" className="mt-0 space-y-6 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-2xl font-black">Overview</h2><p className="mt-1 text-sm text-muted-foreground">Your booking activity and earnings at a glance.</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold text-primary"><TrendingUp className="h-3.5 w-3.5" />Booking data is current</span></div>
          <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 xl:grid-cols-4">
            <FinancialPosition revenue={ov.revenue} pending={ov.pending_payout} />
            <Stat icon={<CalendarCheck className="w-5 h-5" />} label="Bookings" value={ov.booking_count} detail="Recorded booking activity" />
            <Stat icon={verified ? <BadgeCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />} label="Verification" value={verified ? "Verified" : statusLabel(ov.verification_status)} detail={verified ? "Your owner profile is approved" : "Required for publishing"} warn={!verified} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(240px,0.8fr)]">
            <section className="rounded-xl border border-border bg-white p-5"><div className="mb-5"><h3 className="font-display text-lg font-bold">Booking value by date</h3><p className="text-sm text-muted-foreground">Gross value from your recorded bookings.</p></div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={analytics.revenueTrend}><defs><linearGradient id="bookingValueGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={12} /><YAxis tickLine={false} axisLine={false} fontSize={12} width={44} tickFormatter={(value) => `₵${value}`} /><Tooltip formatter={(value) => [ghs(value), "Booking value"]} /><Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#bookingValueGradient)" dot={false} activeDot={false} /></AreaChart></ResponsiveContainer></div></section>
            <section className="rounded-xl border border-border bg-white p-5"><h3 className="font-display text-lg font-bold">Booking health</h3><p className="mt-1 text-sm text-muted-foreground">Current booking status mix.</p><div className="mt-6 space-y-5"><Metric label="Confirmed" value={analytics.confirmed} total={bookings.length} color="bg-primary" /><Metric label="Awaiting payment" value={analytics.pending} total={bookings.length} color="bg-amber-400" /><Metric label="Cancelled" value={analytics.cancelled} total={bookings.length} color="bg-slate-400" /></div></section>
          </div>
          <section className="rounded-xl border border-border bg-white"><div className="flex flex-wrap gap-3 items-center justify-between border-b border-border px-5 py-4"><div><h3 className="font-display text-lg font-bold">Recent booking activity</h3><p className="text-sm text-muted-foreground">Your latest five booking records.</p></div><Button variant="outline" size="sm" onClick={() => setActiveTab("bookings")}>View all</Button></div><div className="divide-y divide-border">{bookings.slice(0, 5).map((booking) => <div key={booking.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm"><div><p className="font-semibold">{booking.turf_name}</p><p className="text-xs text-muted-foreground">{booking.date} · {String(booking.start_hour).padStart(2, "0")}:00</p></div><div className="shrink-0 max-w-[45%] text-right"><p className="font-bold">{ghs(booking.amount_paid || booking.total)}</p><p className={`text-xs capitalize ${statusTone(booking.status)}`}>{booking.status.replace(/_/g, " ")}</p></div></div>)}{bookings.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted-foreground">No booking activity yet.</p>}</div></section>
        </TabsContent>

        <TabsContent value="bookings" className="mt-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-2 data-[state=active]:duration-300"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-2xl font-bold">Bookings</h2><p className="mt-1 text-sm text-muted-foreground">Manage upcoming sessions and customer requests.</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">{bookings.length} total</span></div>
          <div className="hidden overflow-hidden rounded-2xl border border-border/80 bg-white shadow-[0_16px_34px_-30px_rgba(6,40,31,0.55)] md:block">
            <Table className="min-w-[840px]">
              <TableHeader><TableRow className="border-b border-border bg-muted/45 hover:bg-muted/45">
                <TableHead className="h-12 pl-5">Reference</TableHead><TableHead>Turf</TableHead><TableHead>Date</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
                <TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id} data-testid={`owner-booking-${b.id}`} className="group border-border/80 transition-colors hover:bg-accent/35">
                    <TableCell className="pl-5 font-mono text-[11px] font-semibold text-muted-foreground">{b.reference}</TableCell>
                    <TableCell><p className="font-semibold text-foreground">{b.turf_name}</p><p className="mt-0.5 text-xs text-muted-foreground">{b.customer?.name || "Customer booking"}</p></TableCell>
                    <TableCell className="text-sm font-medium">{b.date}</TableCell>
                    <TableCell className="text-sm font-medium">{String(b.start_hour).padStart(2, "0")}:00</TableCell>
                    <TableCell className="text-sm font-medium">{new Date(b.end_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${b.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : b.status.includes("cancel") ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{b.status.replace(/_/g, " ")}</span>
                      {b.reschedule_request?.status === "pending" && <div className="mt-1 text-[10px] font-bold text-amber-700">RESCHEDULE REQUEST</div>}
                    </TableCell>
                    <TableCell className="font-semibold">{ghs(b.amount_paid || b.total)}</TableCell>
                    <TableCell className="pr-5"><BookingActions booking={b} decide={decide} ownerCancel={ownerCancel} /></TableCell>
                  </TableRow>
                ))}
                {bookings.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No bookings yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-3 md:hidden">
            {bookings.map((b) => <article key={b.id} className="rounded-2xl border border-border/80 bg-white p-4 shadow-[0_12px_28px_-26px_rgba(6,40,31,0.55)]" data-testid={`owner-booking-mobile-${b.id}`}>
              <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{b.turf_name}</p><p className="mt-1 font-mono text-[11px] font-semibold text-muted-foreground">{b.reference}</p></div><BookingActions booking={b} decide={decide} ownerCancel={ownerCancel} compact /></div>
              <div className="mt-4 flex items-start justify-between gap-3 border-y border-border py-3 text-sm"><div><p className="font-medium">{b.date}</p><p className="mt-1 text-muted-foreground">{String(b.start_hour).padStart(2, "0")}:00 · {b.duration} hour{b.duration === 1 ? "" : "s"}</p></div><div className="text-right"><p className="font-bold">{ghs(b.amount_paid || b.total)}</p><span className={`mt-1 inline-flex rounded-full px-2 py-1 text-[10px] font-bold uppercase ${b.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : b.status.includes("cancel") ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{b.status.replace(/_/g, " ")}</span></div></div>
              {b.reschedule_request?.status === "pending" && <p className="mt-3 text-xs font-bold text-amber-700">RESCHEDULE REQUEST PENDING</p>}
            </article>)}
            {bookings.length === 0 && <p className="rounded-xl border border-border bg-white py-8 text-center text-sm text-muted-foreground">No bookings yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="turfs" className="mt-0"><div className="mb-6"><h2 className="font-display text-2xl font-bold">My turfs</h2><p className="mt-1 text-sm text-muted-foreground">Keep your listings accurate and ready for the next match.</p></div>
          <div className="flex justify-end my-4">{verified ? <TurfDialog onDone={load} /> :
            <span className="text-sm text-muted-foreground flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-amber-500" /> Verify your account to add turfs</span>}</div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {turfs.map((t) => (
              <div key={t.id} className="bg-white border border-border rounded-xl overflow-hidden" data-testid={`owner-turf-${t.id}`}>
                <img src={t.images?.[0]} alt={t.name} loading="lazy" className="w-full h-40 object-cover" />
                <div className="p-4">
                  <h3 className="font-display font-bold">{t.name}</h3>
                  <p className="text-xs text-muted-foreground">{t.neighborhood} · {t.turf_type}</p>
                  <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
                    <span className="font-bold">{ghs(t.base_hourly)}/hr</span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" data-testid={`preview-turf-${t.id}`} onClick={() => setPreviewTurf(t)}>Preview</Button>
                      <TurfDialog turf={t} onDone={load} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="payouts" className="mt-0"><div className="mb-6"><h2 className="font-display text-2xl font-bold">Payouts</h2><p className="mt-1 text-sm text-muted-foreground">Track your earnings and manage where you get paid.</p></div>
          <PayoutMethodCard />
          <div className="bg-white border border-border rounded-xl overflow-hidden mt-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ref</TableHead><TableHead>Session end</TableHead><TableHead>Gross</TableHead>
                <TableHead>Fee</TableHead><TableHead>Net</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {bookings.filter((b) => b.status === "confirmed").map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                    <TableCell className="text-sm">{new Date(b.end_datetime).toLocaleString()}</TableCell>
                    <TableCell>{ghs(b.amount_paid)}</TableCell>
                    <TableCell className="text-muted-foreground">-{ghs(b.payout?.fee)}</TableCell>
                    <TableCell className="font-bold">{ghs(b.payout?.net_payout)}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${b.payout?.state === "released" ? "bg-accent text-primary" : "bg-amber-50 text-amber-700"}`}>
                        {b.payout?.state === "released" ? "Released" : b.payout?.state === "held_dispute" ? "On hold" : "Held"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">Payouts release automatically 30 minutes after a session ends, unless a dispute or admin hold is active.</p>
        </TabsContent>

        <TabsContent value="verification" className="mt-0"><div className="mb-6"><h2 className="font-display text-2xl font-bold">Verification</h2><p className="mt-1 text-sm text-muted-foreground">Build trust with a verified owner profile.</p></div>
          <VerificationPanel verified={verified} status={ov.verification_status} onDone={load} />
        </TabsContent>
        </div>
      </Tabs>
      <Dialog open={Boolean(previewTurf)} onOpenChange={(open) => !open && setPreviewTurf(null)}>
        <DialogContent aria-describedby={undefined} className="flex h-[90vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-4 pr-12">
            <DialogTitle>Customer preview · {previewTurf?.name}</DialogTitle>
          </DialogHeader>
          {previewTurf && <iframe className="min-h-0 flex-1 border-0" src={`/turf/${previewTurf.id}?preview=owner`} title={`Customer preview of ${previewTurf.name}`} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const statusLabel = (status) => (status || "unverified").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const FinancialPosition = ({ revenue, pending }) => (
  <section className="relative overflow-hidden rounded-xl bg-[#06281f] p-5 text-white shadow-sm min-[400px]:col-span-2" aria-label="Financial position">
    <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-emerald-200"><Wallet className="h-4 w-4" /></span><p className="text-xs font-bold uppercase tracking-[0.14em] text-white/65">Financial position</p></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">Live balance</span></div>
    <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4"><div><p className="text-xs text-white/60">Released revenue</p><p className="mt-1 font-display text-2xl font-black tracking-tight">{ghs(revenue)}</p><p className="mt-1 text-[11px] text-emerald-200">Available to withdraw</p></div><div className="border-l border-white/10 pl-4"><p className="text-xs text-white/60">Pending payout</p><p className="mt-1 font-display text-2xl font-black tracking-tight">{ghs(pending)}</p><p className="mt-1 text-[11px] text-white/55">Settles after play</p></div></div>
  </section>
);

const Stat = ({ icon, label, value, detail, warn }) => (
  <div className={`relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm ${warn ? "border-amber-300" : "border-border"}`}>
    <div className={`absolute inset-x-0 top-0 h-1 ${warn ? "bg-amber-400" : "bg-primary/70"}`} />
    <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${warn ? "text-amber-800" : "text-muted-foreground"}`}><span className={`grid h-8 w-8 place-items-center rounded-lg ${warn ? "bg-amber-50" : "bg-accent"}`}>{icon}</span>{label}</div>
    <div className="mt-4 break-words font-display text-2xl font-black leading-none">{value}</div>
    <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
  </div>
);

const Metric = ({ label, value, total, color }) => {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return <div><div className="mb-2 flex items-center justify-between text-sm"><span className="font-medium">{label}</span><span className="font-bold">{value} <span className="font-normal text-muted-foreground">({percent}%)</span></span></div><div className="h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} /></div></div>;
};

const statusTone = (status) => status === "confirmed" ? "font-semibold text-primary" : status === "pending_payment" || status === "pending" ? "font-semibold text-amber-600" : "text-slate-500";

const AMENITY_OPTS = ["Floodlights", "Changing Rooms", "Parking", "Showers", "Cafeteria", "Water", "Indoor", "Spectator Seating", "WiFi", "Equipment Rental", "First Aid"];

const MOMO_PROVIDERS = ["MTN MoMo", "Telecel Cash", "AirtelTigo Money"];

function PayoutMethodCard() {
  const [pm, setPm] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState({ type: "momo", account_name: "", bank_name: "", account_number: "", momo_provider: "MTN MoMo", momo_number: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/owner/payout-method").then((r) => { setPm(r.data); if (r.data) setF((current) => ({ ...current, ...r.data })); setLoaded(true); });
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/owner/payout-method", f);
      setPm(data); toast.success("Payout account saved");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); } finally { setBusy(false); }
  };

  if (!loaded) return null;

  return (
    <div className="bg-white border border-border rounded-xl p-5" data-testid="payout-method-card">
      <div className="flex items-center gap-2 mb-1">
        <Landmark className="w-5 h-5 text-primary" />
        <h3 className="font-display font-bold text-lg">Payout account</h3>
        {pm ? <span className="ml-auto text-xs font-bold uppercase bg-accent text-primary px-2 py-0.5 rounded">On file</span>
            : <span className="ml-auto text-xs font-bold uppercase bg-amber-50 text-amber-700 px-2 py-0.5 rounded">Not set</span>}
      </div>
      <p className="text-sm text-muted-foreground mb-4">Where GoTurf sends your released payouts. Bank or mobile money.</p>

      <div className="flex gap-2 mb-4">
        {[["momo", "Mobile Money"], ["bank", "Bank account"]].map(([v, label]) => (
          <button key={v} type="button" data-testid={`pm-type-${v}`} onClick={() => setF({ ...f, type: v })}
            className={`text-sm font-semibold px-4 py-2 rounded-lg border ${f.type === v ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground"}`}>{label}</button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Label htmlFor="pm-account-name">Account holder name</Label><Input id="pm-account-name" data-testid="pm-account-name" value={f.account_name} onChange={(e) => setF({ ...f, account_name: e.target.value })} /></div>
        {f.type === "momo" ? (
          <>
            <div>
              <Label>Provider</Label>
              <select data-testid="pm-momo-provider" value={f.momo_provider} onChange={(e) => setF({ ...f, momo_provider: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                {MOMO_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div><Label htmlFor="pm-momo-number">MoMo number</Label><Input id="pm-momo-number" data-testid="pm-momo-number" value={f.momo_number} onChange={(e) => setF({ ...f, momo_number: e.target.value })} placeholder="024 000 0000" /></div>
          </>
        ) : (
          <>
            <div><Label htmlFor="pm-bank-name">Bank name</Label><Input id="pm-bank-name" data-testid="pm-bank-name" value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></div>
            <div><Label htmlFor="pm-account-number">Account number</Label><Input id="pm-account-number" data-testid="pm-account-number" value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} /></div>
          </>
        )}
      </div>
      <Button data-testid="save-payout-method" disabled={busy} onClick={save} className="mt-4 bg-primary hover:bg-primary/90">{busy ? "Saving…" : "Save payout account"}</Button>
    </div>
  );
}


function VerificationPanel({ verified, status, onDone }) {
  const [cardNo, setCardNo] = useState("");
  const [cardFile, setCardFile] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [busy, setBusy] = useState(false);

  if (verified) {
    return (
      <div className="bg-white border border-border rounded-xl p-8 mt-4 text-center" data-testid="verification-approved">
        <BadgeCheck className="w-12 h-12 text-primary mx-auto mb-3" />
        <h3 className="font-display font-extrabold text-xl">You're verified</h3>
        <p className="text-sm text-muted-foreground mt-1">Your Ghana Card has been approved. You can publish and manage turfs.</p>
      </div>
    );
  }

  const submit = async () => {
    if (!cardNo || !cardFile || !selfie) { toast.error("Provide your Ghana Card number, a card photo and a selfie"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("ghana_card_number", cardNo);
      fd.append("card_image", cardFile);
      fd.append("selfie", selfie);
      await api.post("/owner/verification", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Submitted — an admin will review your documents");
      onDone();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); } finally { setBusy(false); }
  };

  return (
    <div className="bg-white border border-border rounded-xl p-6 mt-4 max-w-xl" data-testid="verification-form">
      <h3 className="font-display font-extrabold text-xl mb-1">Ghana Card verification</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Status: <span className="font-bold uppercase">{status || "unverified"}</span>.
        {status === "pending" && " Your submission is under review — you can resubmit if needed."}
        {status === "rejected" && " Your last submission was rejected. Please resubmit clear documents."}
      </p>
      <div className="space-y-4">
        <div><Label htmlFor="ghana-card-number">Ghana Card number</Label><Input id="ghana-card-number" data-testid="ghana-card-number" value={cardNo} onChange={(e) => setCardNo(e.target.value)} placeholder="GHA-XXXXXXXXX-X" /></div>
        <div>
          <Label>Ghana Card photo</Label>
          <Input data-testid="card-image" type="file" accept="image/*" onChange={(e) => setCardFile(e.target.files?.[0])} />
        </div>
        <div>
          <Label>Selfie (liveness)</Label>
          <Input data-testid="selfie-image" type="file" accept="image/*" onChange={(e) => setSelfie(e.target.files?.[0])} />
        </div>
        <Button data-testid="submit-verification" disabled={busy} onClick={submit} className="w-full bg-primary hover:bg-primary/90">
          <Upload className="w-4 h-4 mr-1.5" /> {busy ? "Uploading…" : "Submit for review"}
        </Button>
      </div>
    </div>
  );
}


function TurfDialog({ turf, onDone, editor = false }) {
  const navigate = useNavigate();
  const [imageUrl, setImageUrl] = useState("");
  const [rule, setRule] = useState("");
  const [uploading, setUploading] = useState(false);
  const initialForm = () => turf ? { ...turf, rules: [...(turf.rules || [])], packages: [...(turf.packages || [])], images: [...(turf.images || [])], amenities: [...(turf.amenities || [])], peak_hours: [...(turf.peak_hours || [])], map_url: turf.map_url || "", event_bookings: Boolean(turf.event_bookings), event_details: turf.event_details || "" } : {
    name: "", neighborhood: "", location: "", description: "", turf_type: "5-a-side", playing_format: "5v5",
    base_hourly: 150, peak_hourly: 200, weekend_hourly: 220,
    open_hour: 6, close_hour: 23, peak_hours: [17, 18, 19, 20, 21], is_24_hour: false, map_url: "", images: [], packages: [],
    amenities: ["Floodlights", "Parking", "Water"], rules: ["No metal studs", "Arrive 10 minutes early"], event_bookings: false, event_details: "",
  };
  const [f, setF] = useState(initialForm);
  const discardChanges = () => { setF(initialForm()); setImageUrl(""); setRule(""); };

  const toggleAmenity = (a) => setF((p) => ({ ...p, amenities: p.amenities.includes(a) ? p.amenities.filter((x) => x !== a) : [...p.amenities, a] }));
  const addImage = (url) => {
    const value = url.trim();
    if (!value) return;
    if (f.images.length >= 5) { toast.error("You can add up to five photos"); return; }
    setF((current) => ({ ...current, images: [...current.images, value] }));
    setImageUrl("");
  };
  const uploadImage = async (file) => {
    if (!file) return;
    if (f.images.length >= 5) { toast.error("You can add up to five photos"); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const { data } = await api.post("/owner/turfs/media", form);
      setF((current) => ({ ...current, images: [...current.images, data.url] }));
      toast.success("Photo uploaded");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); } finally { setUploading(false); }
  };
  const removeImage = (index) => setF((current) => ({ ...current, images: current.images.filter((_, i) => i !== index) }));
  const makeCover = (index) => setF((current) => ({ ...current, images: [current.images[index], ...current.images.filter((_, i) => i !== index)] }));
  const addRule = () => {
    const value = rule.trim();
    if (!value || f.rules.includes(value)) return;
    setF((current) => ({ ...current, rules: [...current.rules, value] }));
    setRule("");
  };
  const updatePackage = (index, key, value) => setF((current) => ({ ...current, packages: current.packages.map((item, i) => i === index ? { ...item, [key]: value } : item) }));

  const save = async () => {
    if (!f.is_24_hour && (Number(f.open_hour) < 0 || Number(f.close_hour) > 24 || Number(f.open_hour) >= Number(f.close_hour))) {
      toast.error("Set valid opening and closing hours"); return;
    }
    try {
      const payload = { ...f, is_24_hour: Boolean(f.is_24_hour), event_bookings: Boolean(f.event_bookings), map_url: f.map_url.trim(), base_hourly: Number(f.base_hourly), peak_hourly: Number(f.peak_hourly), weekend_hourly: Number(f.weekend_hourly), peak_hours: (f.peak_hours || []).map(Number).filter((hour) => hour >= 0 && hour <= 23), open_hour: f.is_24_hour ? 0 : Number(f.open_hour), close_hour: f.is_24_hour ? 24 : Number(f.close_hour), packages: f.packages.map((item) => ({ hours: Number(item.hours), discount_pct: Number(item.discount_pct) })).filter((item) => item.hours > 0 && item.discount_pct > 0) };
      if (turf) await api.put(`/owner/turfs/${turf.id}`, payload);
      else await api.post("/owner/turfs", payload);
      toast.success(turf ? "Turf updated" : "Turf created");
      onDone();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  if (!editor) return turf ? <Button size="sm" variant="outline" data-testid={`edit-turf-${turf.id}`} onClick={() => navigate(`/owner?turf-editor=${turf.id}`)}>Edit</Button> : <Button className="bg-primary hover:bg-primary/90" data-testid="add-turf-btn" onClick={() => navigate("/owner?turf-editor=new")}><Plus className="w-4 h-4 mr-1.5" /> Add turf</Button>;

  return (
    <div className="min-h-screen bg-muted/30 py-6 sm:py-10">
      <div className="mx-auto max-w-5xl px-5 lg:px-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><button type="button" onClick={() => navigate("/owner")} className="mb-3 inline-flex min-h-10 items-center text-sm font-semibold text-muted-foreground transition-colors hover:text-primary">← Back to listings</button><h1 className="font-display text-3xl font-black tracking-tight">{turf ? `Edit ${turf.name}` : "Create a turf listing"}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Build a detailed marketplace profile that helps customers choose your venue with confidence.</p></div><span className="rounded-full bg-accent px-3 py-1.5 text-xs font-bold text-primary">Listing editor</span></header>
        <div className="rounded-2xl border border-border bg-white shadow-sm"><div className="border-b border-border px-5 py-4 sm:px-8"><p className="text-sm font-semibold">Listing details</p><p className="mt-1 text-sm text-muted-foreground">Changes save only when you select Save changes.</p></div>
        <div className="space-y-6 p-5 sm:p-8">
          <div><Label htmlFor="turf-name">Name</Label><Input id="turf-name" data-testid="turf-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label htmlFor="turf-hood">Neighborhood</Label><Input id="turf-hood" data-testid="turf-hood" value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} /></div>
            <div><Label>Pitch type</Label><select aria-label="Pitch type" value={f.turf_type} onChange={(e) => setF({ ...f, turf_type: e.target.value })} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option>5-a-side</option><option>7-a-side</option><option>11-a-side</option><option>Futsal</option><option>Multi-sport</option></select></div>
          </div>
          <div><Label>Playing format</Label><Input aria-label="Playing format" value={f.playing_format} onChange={(e) => setF({ ...f, playing_format: e.target.value })} placeholder="e.g. 5v5, 7v7 or Futsal 5v5" /></div>
          <div><Label>Address</Label><Input aria-label="Address" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Street, area, city" /></div>
          <div className="rounded-xl border border-border bg-muted/30 p-4"><Label htmlFor="turf-map-url">Google Maps link <span className="text-muted-foreground">(optional)</span></Label><Input id="turf-map-url" type="url" value={f.map_url} onChange={(e) => setF({ ...f, map_url: e.target.value })} placeholder="https://maps.google.com/..." className="mt-2 bg-white" /><p className="mt-2 text-xs text-muted-foreground">Paste a Maps share link so customers can open exact venue location.</p></div>
          <div>
            <Label>About this turf</Label>
            <textarea aria-label="About this turf" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500}
              placeholder="What makes this turf a great place to play?" className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-muted-foreground">{f.description.length}/500 characters</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>Base /hr</Label><Input aria-label="Base /hr" type="number" data-testid="turf-base" value={f.base_hourly} onChange={(e) => setF({ ...f, base_hourly: e.target.value })} /></div>
            <div><Label>Peak /hr</Label><Input aria-label="Peak /hr" type="number" value={f.peak_hourly} onChange={(e) => setF({ ...f, peak_hourly: e.target.value })} /></div>
            <div><Label>Weekend /hr</Label><Input aria-label="Weekend /hr" type="number" value={f.weekend_hourly} onChange={(e) => setF({ ...f, weekend_hourly: e.target.value })} /></div>
          </div>
          <fieldset className="rounded-lg border border-border bg-muted/30 p-3">
            <legend className="px-1 text-sm font-semibold">Peak pricing hours</legend>
            <p className="mb-3 text-xs text-muted-foreground">Select the hours when the peak rate applies. Leave all hours clear to use the standard rate throughout the day.</p>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
              {PEAK_HOURS.map((hour) => {
                const selected = (f.peak_hours || []).includes(hour);
                return <button key={hour} type="button" aria-pressed={selected} onClick={() => setF((current) => ({ ...current, peak_hours: selected ? current.peak_hours.filter((item) => item !== hour) : [...(current.peak_hours || []), hour].sort((a, b) => a - b) }))} className={`min-h-10 rounded-md border text-xs font-bold transition-colors ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white text-foreground hover:border-primary/50"}`}>{String(hour).padStart(2, "0")}:00</button>;
              })}
            </div>
          </fieldset>
          <div>
            <Label>Amenities</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {AMENITY_OPTS.map((a) => (
                <button type="button" key={a} onClick={() => toggleAmenity(a)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${f.amenities.includes(a) ? "bg-accent border-primary text-primary" : "border-border text-muted-foreground"}`}>{a}</button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4"><div className="flex items-start justify-between gap-4"><div><Label htmlFor="event-bookings">Available for private events</Label><p className="mt-1 text-xs text-muted-foreground">Show customers if venue can host birthdays, corporate games, school events, tournaments, or other non-match bookings.</p></div><input id="event-bookings" type="checkbox" checked={Boolean(f.event_bookings)} onChange={(e) => setF({ ...f, event_bookings: e.target.checked })} className="mt-1 h-5 w-5 accent-primary" /></div>{f.event_bookings && <div className="mt-4"><Label htmlFor="event-details">Events and special arrangements</Label><textarea id="event-details" value={f.event_details} onChange={(e) => setF({ ...f, event_details: e.target.value })} maxLength={500} rows={4} placeholder="Describe event types, group capacity, equipment, catering, staff support, or custom pricing." className="mt-2 min-h-24 w-full rounded-md border border-input bg-white px-3 py-2 text-sm" /><p className="mt-1 text-xs text-muted-foreground">{f.event_details.length}/500 characters</p></div>}</div>
          <div className="rounded-lg border border-border p-3">
            <Label>Pitch rules</Label><p className="text-xs text-muted-foreground">Clear rules help customers arrive prepared.</p>
            <div className="mt-2 flex gap-2"><Input aria-label="New pitch rule" value={rule} onChange={(e) => setRule(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRule(); } }} placeholder="e.g. No smoking on the pitch" /><Button type="button" variant="outline" onClick={addRule}>Add</Button></div>
            <div className="mt-2 flex flex-wrap gap-1.5">{f.rules.map((item, index) => <span key={`${item}-${index}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium">{item}<button type="button" onClick={() => setF((current) => ({ ...current, rules: current.rules.filter((_, i) => i !== index) }))} aria-label={`Remove rule ${index + 1}`}><X className="h-3.5 w-3.5" /></button></span>)}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap gap-2 items-center justify-between"><div><Label>Multi-hour packages</Label><p className="text-xs text-muted-foreground">Optional discounts customers can select.</p></div><Button type="button" size="sm" variant="outline" onClick={() => setF((current) => ({ ...current, packages: [...current.packages, { hours: 3, discount_pct: 10 }] }))}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button></div>
            <div className="mt-2 space-y-2">{f.packages.map((item, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><div><Label className="text-xs">Hours</Label><Input aria-label={`Package ${index + 1} hours`} type="number" min="1" value={item.hours} onChange={(e) => updatePackage(index, "hours", e.target.value)} /></div><div><Label className="text-xs">Discount %</Label><Input aria-label={`Package ${index + 1} discount percent`} type="number" min="1" max="100" value={item.discount_pct} onChange={(e) => updatePackage(index, "discount_pct", e.target.value)} /></div><Button type="button" size="icon" variant="ghost" onClick={() => setF((current) => ({ ...current, packages: current.packages.filter((_, i) => i !== index) }))} aria-label={`Remove package ${index + 1}`}><X className="h-4 w-4" /></Button></div>)}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-3">
              <div><Label>Turf photos</Label><p className="text-xs text-muted-foreground">Add up to five real photos. The first is the cover.</p></div>
              <span className="text-xs font-semibold text-muted-foreground">{f.images.length}/5</span>
            </div>
            {f.images.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {f.images.map((src, index) => <div key={`${src}-${index}`} className="group relative overflow-hidden rounded-md border bg-background">
                <img src={src} alt={`Turf photo ${index + 1}`} className="h-20 w-full object-cover" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-1.5 py-1 text-[11px] text-white">
                  <button type="button" onClick={() => makeCover(index)} disabled={index === 0} className="disabled:opacity-60">{index === 0 ? "Cover" : "Set cover"}</button>
                  <button type="button" onClick={() => removeImage(index)} aria-label={`Remove photo ${index + 1}`}><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>)}
            </div>}
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Paste an image URL" aria-label="Image URL" />
              <Button type="button" variant="outline" onClick={() => addImage(imageUrl)}>Add link</Button>
            </div>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-primary/50 bg-background px-3 py-2 text-sm font-semibold text-primary hover:bg-accent">
              <ImagePlus className="h-4 w-4" /> {uploading ? "Uploading photo…" : "Upload a photo"}
              <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" disabled={uploading || f.images.length >= 5} onChange={(e) => uploadImage(e.target.files?.[0])} />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">JPEG, PNG or WebP, up to 5 MB each.</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-start justify-between gap-3"><div><Label htmlFor="turf-24-hour">Open 24/7</Label><p className="mt-1 text-xs text-muted-foreground">Customers can book through midnight and into the following day.</p></div><input id="turf-24-hour" type="checkbox" checked={Boolean(f.is_24_hour)} onChange={(e) => setF({ ...f, is_24_hour: e.target.checked, open_hour: e.target.checked ? 0 : f.open_hour, close_hour: e.target.checked ? 24 : f.close_hour })} className="mt-1 h-5 w-5 accent-primary" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><Label>Opens at</Label><Input aria-label="Opens at" type="number" min="0" max="23" disabled={f.is_24_hour} value={f.is_24_hour ? 0 : f.open_hour} onChange={(e) => setF({ ...f, open_hour: e.target.value })} /></div><div><Label>Closes at</Label><Input aria-label="Closes at" type="number" min="1" max="24" disabled={f.is_24_hour} value={f.is_24_hour ? 24 : f.close_hour} onChange={(e) => setF({ ...f, close_hour: e.target.value })} /></div></div>
        </div>
        <div className="flex flex-col-reverse gap-3 border-t border-border bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end sm:px-8">{turf && <Button type="button" variant="outline" onClick={discardChanges} className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">Discard changes</Button>}<Button disabled={uploading || !f.name.trim() || !f.location.trim() || !f.images.length} onClick={save} data-testid="save-turf" className="bg-primary hover:bg-primary/90">{turf ? "Save changes" : "Create turf"}</Button></div>
        </div>
      </div>
    </div>
  );
}
