import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError, ghs } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Wallet, CalendarCheck, Building2, AlertTriangle, Plus } from "lucide-react";

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
    if (!user || !["owner", "admin"].includes(user.role)) { navigate("/auth"); return; }
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

  return (
    <div className="max-w-7xl mx-auto px-5 lg:px-8 py-8">
      <h1 className="font-display font-black text-3xl mb-1">Owner dashboard</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage your turfs, bookings and payouts.</p>

      {suspended && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-2 text-sm font-semibold text-red-700">
          <AlertTriangle className="w-5 h-5" /> Your account is suspended until {new Date(ov.suspended_until).toLocaleDateString()} due to repeated cancellations.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Stat icon={<Wallet className="w-5 h-5" />} label="Released revenue" value={ghs(ov.revenue)} />
        <Stat icon={<Wallet className="w-5 h-5" />} label="Pending payout" value={ghs(ov.pending_payout)} />
        <Stat icon={<CalendarCheck className="w-5 h-5" />} label="Bookings" value={ov.booking_count} />
        <Stat icon={<AlertTriangle className="w-5 h-5" />} label="Strikes" value={`${ov.strikes} / 5`} warn={ov.strikes >= 3} />
      </div>

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings" data-testid="owner-tab-bookings">Bookings</TabsTrigger>
          <TabsTrigger value="turfs" data-testid="owner-tab-turfs">My turfs</TabsTrigger>
          <TabsTrigger value="payouts" data-testid="owner-tab-payouts">Payouts</TabsTrigger>
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
          <div className="flex justify-end my-4"><TurfDialog onDone={load} /></div>
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

function TurfDialog({ turf, onDone }) {
  const [open, setOpen] = useState(false);
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
          <div><Label>Image URL</Label><Input value={f.images?.[0] || ""} onChange={(e) => setF({ ...f, images: [e.target.value] })} /></div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="save-turf" className="bg-primary hover:bg-primary/90">{turf ? "Save changes" : "Create turf"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
