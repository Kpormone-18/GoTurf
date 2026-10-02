import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError, ghs, BACKEND_URL } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Wallet, CalendarCheck, Building2, AlertTriangle, Plus, BadgeCheck, Upload, ShieldAlert, Landmark, X, ImagePlus } from "lucide-react";

export default function OwnerDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [ov, setOv] = useState(null);
  const [turfs, setTurfs] = useState([]);
  const [bookings, setBookings] = useState([]);

  const load = useCallback(() => {
    api.get("/owner/overview").then((r) => setOv(r.data));
    api.get("/owner/turfs").then((r) => setTurfs(r.data));
    api.get("/owner/bookings").then((r) => setBookings(r.data));
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
  const ownerCancel = async (b) => {
    try { const { data } = await api.post(`/owner/bookings/${b.id}/cancel`); toast.warning(`Cancelled. Strike #${data.strikes} issued.`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  if (!ov) return <div className="max-w-7xl mx-auto px-5 py-20 text-muted-foreground">Loading dashboard…</div>;
  const suspended = ov.suspended_until && new Date(ov.suspended_until) > new Date();
  const verified = ov.verified;

  return (
    <div className="max-w-7xl mx-auto px-5 lg:px-8 py-8">
      <h1 className="font-display font-black text-3xl mb-1">Owner dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage your turfs, bookings and payouts.</p>

      {suspended && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-2 text-sm font-semibold text-red-700">
          <AlertTriangle className="w-5 h-5" /> Your account is suspended until {new Date(ov.suspended_until).toLocaleDateString()} due to repeated cancellations.
        </div>
      )}

      {!verified && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-2 text-sm font-semibold text-amber-800" data-testid="verify-banner">
          <ShieldAlert className="w-5 h-5" /> Complete Ghana Card verification to publish your turfs.
          Status: <span className="uppercase">{ov.verification_status}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat icon={<Wallet className="w-5 h-5" />} label="Released revenue" value={ghs(ov.revenue)} />
        <Stat icon={<Wallet className="w-5 h-5" />} label="Pending payout" value={ghs(ov.pending_payout)} />
        <Stat icon={<CalendarCheck className="w-5 h-5" />} label="Bookings" value={ov.booking_count} />
        <Stat icon={verified ? <BadgeCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />} label="Verification" value={verified ? "Verified" : (ov.verification_status || "Unverified")} warn={!verified} />
      </div>

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings" data-testid="owner-tab-bookings">Bookings</TabsTrigger>
          <TabsTrigger value="turfs" data-testid="owner-tab-turfs">My turfs</TabsTrigger>
          <TabsTrigger value="payouts" data-testid="owner-tab-payouts">Payouts</TabsTrigger>
          <TabsTrigger value="verification" data-testid="owner-tab-verification">Verification</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          <div className="bg-white border border-border rounded-xl overflow-hidden mt-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ref</TableHead><TableHead>Turf</TableHead><TableHead>When</TableHead>
                <TableHead>Status</TableHead><TableHead>Amount</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id} data-testid={`owner-booking-${b.id}`}>
                    <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                    <TableCell>{b.turf_name}</TableCell>
                    <TableCell className="text-sm">{b.date} {String(b.start_hour).padStart(2, "0")}:00 ·{b.duration}h</TableCell>
                    <TableCell><span className="text-xs font-bold uppercase">{b.status.replace(/_/g, " ")}</span>
                      {b.reschedule_request?.status === "pending" && <div className="text-[10px] text-amber-600 font-bold">RESCHEDULE REQ</div>}
                    </TableCell>
                    <TableCell>{ghs(b.amount_paid || b.total)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {b.reschedule_request?.status === "pending" && (
                        <>
                          <Button size="sm" variant="outline" data-testid={`rs-approve-${b.id}`} onClick={() => decide(b, true)}>Approve</Button>
                          <Button size="sm" variant="ghost" data-testid={`rs-reject-${b.id}`} onClick={() => decide(b, false)}>Reject</Button>
                        </>
                      )}
                      {b.status === "confirmed" && (
                        <Button size="sm" variant="destructive" data-testid={`owner-cancel-${b.id}`} onClick={() => ownerCancel(b)}>Cancel</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {bookings.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No bookings yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="turfs">
          <div className="flex justify-end my-4">{verified ? <TurfDialog onDone={load} /> :
            <span className="text-sm text-muted-foreground flex items-center gap-1.5"><ShieldAlert className="w-4 h-4 text-amber-500" /> Verify your account to add turfs</span>}</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {turfs.map((t) => (
              <div key={t.id} className="bg-white border border-border rounded-xl overflow-hidden" data-testid={`owner-turf-${t.id}`}>
                <img src={t.images?.[0]} alt={t.name} className="w-full h-32 object-cover" />
                <div className="p-4">
                  <h3 className="font-display font-bold">{t.name}</h3>
                  <p className="text-xs text-muted-foreground">{t.neighborhood} · {t.turf_type}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-bold">{ghs(t.base_hourly)}/hr</span>
                    <TurfDialog turf={t} onDone={load} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="payouts">
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

        <TabsContent value="verification">
          <VerificationPanel verified={verified} status={ov.verification_status} onDone={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

const Stat = ({ icon, label, value, warn }) => (
  <div className={`bg-white border rounded-xl p-4 ${warn ? "border-amber-300" : "border-border"}`}>
    <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">{icon}{label}</div>
    <div className="font-display font-black text-2xl mt-2">{value}</div>
  </div>
);

const AMENITY_OPTS = ["Floodlights", "Changing Rooms", "Parking", "Showers", "Cafeteria", "Water", "Indoor", "Spectator Seating", "WiFi", "Equipment Rental", "First Aid"];

const MOMO_PROVIDERS = ["MTN MoMo", "Telecel Cash", "AirtelTigo Money"];

function PayoutMethodCard() {
  const [pm, setPm] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState({ type: "momo", account_name: "", bank_name: "", account_number: "", momo_provider: "MTN MoMo", momo_number: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/owner/payout-method").then((r) => {
      setPm(r.data);
      if (r.data) {
        const clean = Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, v ?? ""]));
        setF((prev) => ({ ...prev, ...clean, momo_provider: clean.momo_provider || "MTN MoMo" }));
      }
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="sm:col-span-2"><Label>Account holder name</Label><Input data-testid="pm-account-name" value={f.account_name} onChange={(e) => setF({ ...f, account_name: e.target.value })} /></div>
        {f.type === "momo" ? (
          <>
            <div>
              <Label>Provider</Label>
              <select data-testid="pm-momo-provider" value={f.momo_provider} onChange={(e) => setF({ ...f, momo_provider: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                {MOMO_PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div><Label>MoMo number</Label><Input data-testid="pm-momo-number" value={f.momo_number} onChange={(e) => setF({ ...f, momo_number: e.target.value })} placeholder="024 000 0000" /></div>
          </>
        ) : (
          <>
            <div><Label>Bank name</Label><Input data-testid="pm-bank-name" value={f.bank_name} onChange={(e) => setF({ ...f, bank_name: e.target.value })} /></div>
            <div><Label>Account number</Label><Input data-testid="pm-account-number" value={f.account_number} onChange={(e) => setF({ ...f, account_number: e.target.value })} /></div>
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
        <div><Label>Ghana Card number</Label><Input data-testid="ghana-card-number" value={cardNo} onChange={(e) => setCardNo(e.target.value)} placeholder="GHA-XXXXXXXXX-X" /></div>
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


function TurfDialog({ turf, onDone }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [f, setF] = useState(turf || {
    name: "", neighborhood: "", location: "", description: "", turf_type: "5-a-side", playing_format: "5v5",
    base_hourly: 150, peak_hourly: 200, weekend_hourly: 220,
    images: ["https://images.unsplash.com/photo-1784984914504-0d991709dcac?crop=entropy&cs=srgb&fm=jpg&q=85&w=1400"],
    amenities: ["Floodlights", "Parking", "Water"], rules: ["No metal studs", "Arrive 10 minutes early"],
  });

  const toggleAmenity = (a) => setF((p) => ({ ...p, amenities: p.amenities.includes(a) ? p.amenities.filter((x) => x !== a) : [...p.amenities, a] }));

  const save = async () => {
    try {
      const payload = { ...f, base_hourly: Number(f.base_hourly), peak_hourly: Number(f.peak_hourly), weekend_hourly: Number(f.weekend_hourly) };
      if (turf) await api.put(`/owner/turfs/${turf.id}`, payload);
      else await api.post("/owner/turfs", payload);
      toast.success(turf ? "Turf updated" : "Turf created");
      setOpen(false); onDone();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {turf ? <Button size="sm" variant="outline" data-testid={`edit-turf-${turf.id}`}>Edit</Button>
          : <Button className="bg-primary hover:bg-primary/90" data-testid="add-turf-btn"><Plus className="w-4 h-4 mr-1.5" /> Add turf</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{turf ? "Edit turf" : "List a new turf"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input data-testid="turf-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Neighborhood</Label><Input data-testid="turf-hood" value={f.neighborhood} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} /></div>
            <div><Label>Type</Label><Input data-testid="turf-type" value={f.turf_type} onChange={(e) => setF({ ...f, turf_type: e.target.value })} /></div>
          </div>
          <div><Label>Address</Label><Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Base /hr</Label><Input type="number" data-testid="turf-base" value={f.base_hourly} onChange={(e) => setF({ ...f, base_hourly: e.target.value })} /></div>
            <div><Label>Peak /hr</Label><Input type="number" value={f.peak_hourly} onChange={(e) => setF({ ...f, peak_hourly: e.target.value })} /></div>
            <div><Label>Weekend /hr</Label><Input type="number" value={f.weekend_hourly} onChange={(e) => setF({ ...f, weekend_hourly: e.target.value })} /></div>
          </div>
          <div>
            <Label>Amenities</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {AMENITY_OPTS.map((a) => (
                <button type="button" key={a} onClick={() => toggleAmenity(a)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${f.amenities.includes(a) ? "bg-accent border-primary text-primary" : "border-border text-muted-foreground"}`}>{a}</button>
              ))}
            </div>
          </div>
          <div>
            <Label>Turf photos</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(f.images || []).map((img, i) => (
                <div key={i} className="relative group rounded-lg overflow-hidden border border-border aspect-video">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                  <button type="button" data-testid={`remove-image-${i}`}
                    onClick={() => setF({ ...f, images: f.images.filter((_, idx) => idx !== i) })}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <label data-testid="upload-image-label" className="aspect-video rounded-lg border-2 border-dashed border-border grid place-items-center cursor-pointer hover:border-primary text-muted-foreground hover:text-primary">
                {uploading ? <span className="text-xs font-semibold">Uploading…</span> : <span className="flex flex-col items-center text-xs font-semibold"><ImagePlus className="w-5 h-5 mb-1" /> Upload</span>}
                <input type="file" accept="image/*" multiple className="hidden" data-testid="turf-image-input"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    setUploading(true);
                    try {
                      const fd = new FormData();
                      files.forEach((file) => fd.append("files", file));
                      const { data } = await api.post("/owner/uploads", fd, { headers: { "Content-Type": "multipart/form-data" } });
                      const urls = data.files.map((x) => `${BACKEND_URL}${x.url}`);
                      setF((prev) => ({ ...prev, images: [...(prev.images || []), ...urls] }));
                    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
                    finally { setUploading(false); e.target.value = ""; }
                  }} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP or GIF up to 6MB. First photo is the cover.</p>
          </div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="save-turf" className="bg-primary hover:bg-primary/90">{turf ? "Save changes" : "Create turf"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
