import { PageError } from "../components/PageError";
import { LoadingScreen } from "../components/LoadingScreen";
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatApiError, ghs, fileUrl } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { TrendingUp, Banknote, Building2, Users, AlertCircle, Plus, BadgeCheck } from "lucide-react";

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [loadError, setLoadError] = useState(false);
  const [stats, setStats] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [owners, setOwners] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [logs, setLogs] = useState([]);
  const [verifications, setVerifications] = useState([]);

  const load = useCallback(() => {
    api.get("/admin/stats").then((r) => setStats(r.data)).catch(() => setLoadError(true));
    api.get("/admin/bookings").then((r) => setBookings(r.data));
    api.get("/admin/owners").then((r) => setOwners(r.data));
    api.get("/admin/disputes").then((r) => setDisputes(r.data));
    api.get("/admin/coupons").then((r) => setCoupons(r.data));
    api.get("/admin/audit-logs").then((r) => setLogs(r.data));
    api.get("/admin/verifications").then((r) => setVerifications(r.data));
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user || user.role !== "admin") { navigate("/admin/login"); return; }
    load();
  }, [user, loading, navigate, load]);

  const refund = async (b) => {
    try { await api.post(`/admin/bookings/${b.id}/refund?amount=${b.amount_paid || b.total}`); toast.success("Refund issued"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const hold = async (b) => {
    try { await api.post(`/admin/bookings/${b.id}/hold?hold=${!b.admin_hold}`); toast.success("Payout hold toggled"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const suspend = async (o) => {
    try { await api.post(`/admin/owners/${o.id}/suspend?suspend=${!o.suspended}`); toast.success(o.suspended ? "Reinstated" : "Suspended"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const resetStrikes = async (o) => {
    try { await api.post(`/admin/owners/${o.id}/reset-strikes`); toast.success("Strikes reset"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const resolve = async (d) => {
    try { await api.post(`/admin/disputes/${d.id}/resolve?resolution=${encodeURIComponent("Resolved by admin")}`); toast.success("Dispute resolved"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const toggleCoupon = async (c) => {
    try { await api.post(`/admin/coupons/${c.id}/toggle`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const decideVerification = async (v, approve) => {
    try { await api.post(`/admin/verifications/${v.id}/decision?approve=${approve}`); toast.success(`Verification ${approve ? "approved" : "rejected"}`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  if (loadError) return <PageError />;
  if (!stats) return <LoadingScreen />;

  return (
    <div className="max-w-7xl mx-auto px-5 lg:px-8 py-8">
      <h1 className="font-display font-black text-3xl mb-1">Admin console</h1>
      <p className="text-sm text-muted-foreground mb-6">Platform operations, finance and moderation.</p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Stat icon={<TrendingUp className="w-5 h-5" />} label="GMV" value={ghs(stats.gmv)} />
        <Stat icon={<Banknote className="w-5 h-5" />} label="Platform fees" value={ghs(stats.platform_fees)} />
        <Stat icon={<Building2 className="w-5 h-5" />} label="Turfs" value={stats.turfs} />
        <Stat icon={<Users className="w-5 h-5" />} label="Owners/Customers" value={`${stats.owners}/${stats.customers}`} />
        <Stat icon={<AlertCircle className="w-5 h-5" />} label="Open disputes" value={stats.open_disputes} warn={stats.open_disputes > 0} />
      </div>

      <Tabs defaultValue="bookings">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="bookings" data-testid="admin-tab-bookings">Bookings</TabsTrigger>
          <TabsTrigger value="owners" data-testid="admin-tab-owners">Owners</TabsTrigger>
          <TabsTrigger value="disputes" data-testid="admin-tab-disputes">Disputes</TabsTrigger>
          <TabsTrigger value="coupons" data-testid="admin-tab-coupons">Coupons</TabsTrigger>
          <TabsTrigger value="verifications" data-testid="admin-tab-verifications">Verifications</TabsTrigger>
          <TabsTrigger value="audit" data-testid="admin-tab-audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings">
          <Panel>
            <Table className="min-w-[640px]">
              <TableHeader><TableRow>
                <TableHead>Ref</TableHead><TableHead>Turf</TableHead><TableHead>Status</TableHead>
                <TableHead>Amount</TableHead><TableHead>Payout</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {bookings.map((b) => (
                  <TableRow key={b.id} data-testid={`admin-booking-${b.id}`}>
                    <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                    <TableCell>{b.turf_name}</TableCell>
                    <TableCell className="text-xs font-bold uppercase">{b.status.replace(/_/g, " ")}</TableCell>
                    <TableCell>{ghs(b.amount_paid || b.total)}</TableCell>
                    <TableCell className="text-xs uppercase font-bold">{b.payout?.state}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {b.status === "confirmed" && <Button size="sm" variant="outline" data-testid={`refund-${b.id}`} onClick={() => refund(b)}>Refund</Button>}
                      <Button size="sm" variant="ghost" data-testid={`hold-${b.id}`} onClick={() => hold(b)}>{b.admin_hold ? "Release" : "Hold"}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="owners">
          <Panel>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Owner</TableHead><TableHead>Email</TableHead><TableHead>Turfs</TableHead>
                <TableHead>Strikes</TableHead><TableHead>Penalty</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {owners.map((o) => (
                  <TableRow key={o.id} data-testid={`admin-owner-${o.id}`}>
                    <TableCell className="font-semibold">{o.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{o.email}</TableCell>
                    <TableCell>{o.turf_count}</TableCell>
                    <TableCell><span className={o.strikes >= 5 ? "text-red-600 font-bold" : ""}>{o.strikes}/5</span></TableCell>
                    <TableCell>{ghs(o.penalty_balance)}</TableCell>
                    <TableCell>{o.suspended ? <span className="text-xs font-bold text-red-600 uppercase">Suspended</span> : <span className="text-xs font-bold text-primary uppercase">Active</span>}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" data-testid={`suspend-${o.id}`} onClick={() => suspend(o)}>{o.suspended ? "Reinstate" : "Suspend"}</Button>
                      <Button size="sm" variant="ghost" data-testid={`reset-${o.id}`} onClick={() => resetStrikes(o)}>Reset</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="disputes">
          <Panel>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Ref</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {disputes.map((d) => (
                  <TableRow key={d.id} data-testid={`dispute-${d.id}`}>
                    <TableCell className="font-mono text-xs">{d.reference}</TableCell>
                    <TableCell className="text-sm">{d.reason}</TableCell>
                    <TableCell className="text-xs font-bold uppercase">{d.status}</TableCell>
                    <TableCell className="text-right">{d.status === "open" && <Button size="sm" variant="outline" data-testid={`resolve-${d.id}`} onClick={() => resolve(d)}>Resolve</Button>}</TableCell>
                  </TableRow>
                ))}
                {disputes.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No disputes.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="coupons">
          <div className="flex justify-end my-4"><CouponDialog onDone={load} /></div>
          <Panel>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Code</TableHead><TableHead>Discount</TableHead><TableHead>Uses</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {coupons.map((c) => (
                  <TableRow key={c.id} data-testid={`coupon-${c.id}`}>
                    <TableCell className="font-mono font-bold">{c.code}</TableCell>
                    <TableCell>{c.discount_pct ? `${c.discount_pct}%` : ghs(c.discount_amount)}</TableCell>
                    <TableCell>{c.uses}/{c.max_uses}</TableCell>
                    <TableCell>{c.active ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right"><Button size="sm" variant="ghost" data-testid={`toggle-coupon-${c.id}`} onClick={() => toggleCoupon(c)}>{c.active ? "Disable" : "Enable"}</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>

        <TabsContent value="verifications">
          {verifications.length === 0 ? (
            <div className="bg-white border border-border rounded-xl p-8 text-center text-muted-foreground mt-4">No verification submissions yet.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              {verifications.map((v) => (
                <div key={v.id} className="bg-white border border-border rounded-xl p-4" data-testid={`verification-${v.id}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-display font-bold">{v.owner_name}</div>
                      <div className="text-xs text-muted-foreground">{v.owner_email}</div>
                    </div>
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${v.status === "approved" ? "bg-accent text-primary" : v.status === "rejected" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>{v.status}</span>
                  </div>
                  <div className="text-sm mt-2"><span className="text-muted-foreground">Ghana Card:</span> <span className="font-mono font-semibold">{v.ghana_card_number}</span></div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Card</div>
                      <img src={fileUrl(v.card_path)} alt="Ghana Card" className="w-full h-28 object-cover rounded-lg border border-border bg-muted" onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Selfie</div>
                      <img src={fileUrl(v.selfie_path)} alt="Selfie" className="w-full h-28 object-cover rounded-lg border border-border bg-muted" onError={(e) => { e.currentTarget.style.opacity = 0.2; }} />
                    </div>
                  </div>
                  {v.status === "pending" && (
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="flex-1 bg-primary hover:bg-primary/90" data-testid={`approve-verification-${v.id}`} onClick={() => decideVerification(v, true)}><BadgeCheck className="w-4 h-4 mr-1.5" /> Approve</Button>
                      <Button size="sm" variant="outline" className="flex-1" data-testid={`reject-verification-${v.id}`} onClick={() => decideVerification(v, false)}>Reject</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="audit">
          <Panel>
            <Table>
              <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Kind</TableHead><TableHead>Message</TableHead></TableRow></TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(l.at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-bold uppercase">{l.kind}</TableCell>
                    <TableCell className="text-sm">{l.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const Panel = ({ children }) => <div className="bg-white border border-border rounded-xl overflow-x-auto mt-4">{children}</div>;
const Stat = ({ icon, label, value, warn }) => (
  <div className={`bg-white border rounded-xl p-4 ${warn ? "border-red-300" : "border-border"}`}>
    <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">{icon}{label}</div>
    <div className="font-display font-black text-2xl mt-2">{value}</div>
  </div>
);

function CouponDialog({ onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ code: "", discount_pct: 10, max_uses: 100 });
  const save = async () => {
    try {
      await api.post("/admin/coupons", { code: f.code, discount_pct: Number(f.discount_pct), max_uses: Number(f.max_uses) });
      toast.success("Coupon created"); setOpen(false); onDone();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-primary hover:bg-primary/90" data-testid="add-coupon-btn"><Plus className="w-4 h-4 mr-1.5" /> New coupon</Button></DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>Create coupon</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="coupon-code">Code</Label><Input id="coupon-code" data-testid="coupon-code" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Discount %</Label><Input aria-label="Discount %" type="number" data-testid="coupon-pct" value={f.discount_pct} onChange={(e) => setF({ ...f, discount_pct: e.target.value })} /></div>
            <div><Label>Max uses</Label><Input aria-label="Max uses" type="number" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="save-coupon" className="bg-primary hover:bg-primary/90">Create</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
