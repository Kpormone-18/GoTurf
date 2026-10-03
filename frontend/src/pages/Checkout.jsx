import { PageError } from "../components/PageError";
import { LoadingScreen } from "../components/LoadingScreen";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError, ghs } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Separator } from "../components/ui/separator";
import { toast } from "sonner";
import { ShieldCheck, Lock, AlertTriangle, CreditCard, Smartphone } from "lucide-react";

export default function Checkout() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loadError, setLoadError] = useState(false);
  const [booking, setBooking] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [cust, setCust] = useState({ name: "", email: "", phone: "" });
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/payments/config").then((r) => setCfg(r.data)).catch(() => setLoadError(true));
    api.get(`/bookings/${bookingId}`).then((r) => {
      setBooking(r.data);
      setCust({ name: r.data.customer.name === "Guest" ? (user?.name || "") : r.data.customer.name,
                email: r.data.customer.email || user?.email || "", phone: r.data.customer.phone || "" });
    }).catch(() => setLoadError(true));
  }, [bookingId, user]);

  if (loadError) return <PageError />;
  if (!booking || !cfg) return <LoadingScreen />;

  const paystack = cfg.provider === "paystack";

  const pay = async () => {
    if (!cust.name || !cust.phone || (!cust.email && !cust.phone)) { toast.error("Enter your name, phone number, and an email or phone"); return; }
    if (paystack && !cust.email) { toast.error("Email is required for Paystack payments"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/bookings/${bookingId}/checkout`, {
        customer: cust, coupon_code: coupon || null,
        callback_url: `${window.location.origin}/payment/callback`,
      });
      if (data.mode === "paystack") {
        window.location.href = data.authorization_url;
      } else {
        toast.success("Payment successful — booking confirmed!");
        navigate(`/confirmation/${data.booking_id}`);
      }
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); setBusy(false); }
  };

  if (busy) return <LoadingScreen label="Preparing your booking" />;

  return (
    <div className="max-w-5xl mx-auto px-5 lg:px-8 py-10 grid lg:grid-cols-5 gap-8">
      <div className="lg:col-span-3">
        <h1 className="font-display font-black text-3xl mb-1">Secure checkout</h1>
        <p className="text-sm text-muted-foreground mb-6 flex items-center gap-1.5"><Lock className="w-4 h-4" /> Your slot is held while you pay.</p>

        <div className="bg-white border border-border rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-bold text-lg">Your details</h2>
          <div><Label htmlFor="co-name">Full name</Label><Input id="co-name" data-testid="co-name" value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><Label htmlFor="co-email">Email {paystack && <span className="text-destructive">*</span>}</Label><Input id="co-email" data-testid="co-email" type="email" autoComplete="email" autoCapitalize="none" value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} placeholder="for your receipt" /></div>
            <div><Label htmlFor="co-phone">Phone <span className="text-destructive">*</span></Label><Input id="co-phone" type="tel" autoComplete="tel" data-testid="co-phone" required value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="+233…" /></div>
          </div>
          {!user && <p className="text-xs text-muted-foreground">Booking as a guest — keep your reference safe to manage this booking later.</p>}
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 mt-5">
          <h2 className="font-display font-bold text-lg mb-3">Promo code</h2>
          <Input aria-label="Promo code" data-testid="co-coupon" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Enter code (optional)" />
        </div>

        <div className="bg-white border border-border rounded-2xl p-6 mt-5">
          <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><CreditCard className="w-5 h-5 text-primary" /> Payment</h2>
          {paystack ? (
            <div className="flex flex-wrap items-center gap-3 mb-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5 font-semibold text-foreground"><CreditCard className="w-4 h-4" /> Card</span>
              <span className="flex items-center gap-1.5 font-semibold text-foreground"><Smartphone className="w-4 h-4" /> Mobile Money</span>
              <span className="text-xs">Secured by Paystack</span>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs font-semibold text-amber-800 mb-4">
              Demo mode — Paystack keys not set, so payment is simulated. No real charge is made.
            </div>
          )}
          <Button data-testid="pay-btn" disabled={busy} onClick={pay} className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90">
            {busy ? "Processing…" : paystack ? `Pay ${ghs(booking.total)} with Paystack` : `Pay ${ghs(booking.total)} & confirm`}
          </Button>
        </div>
      </div>

      <aside className="lg:col-span-2">
        <div className="lg:sticky lg:top-20 bg-white border border-border rounded-2xl p-6">
          <h2 className="font-display font-extrabold text-xl">{booking.turf_name}</h2>
          <div className="mt-3 space-y-1.5 text-sm">
            <Row l="Date" v={booking.date} />
            <Row l="Kickoff" v={`${String(booking.start_hour).padStart(2, "0")}:00`} />
            <Row l="Duration" v={`${booking.duration}h${booking.is_package ? " (package)" : ""}`} />
          </div>
          <Separator className="my-4" />
          <Row l="Hourly total" v={ghs(booking.quote.hourly_total)} />
          {booking.quote.package_discount > 0 && <Row l={`Package (${booking.quote.package_discount_pct}%)`} v={`-${ghs(booking.quote.package_discount)}`} primary />}
          <Separator className="my-4" />
          <div className="flex justify-between font-display font-black text-xl"><span>Total</span><span>{ghs(booking.total)}</span></div>

          <div className="mt-5 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2 text-primary font-semibold"><ShieldCheck className="w-4 h-4" /> Funds held in escrow until you play</div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span><strong>Before you pay:</strong> Cancel for a full refund within the first quarter of the time until kickoff. After that, a GHS 30 penalty is deducted. No-shows are non-refundable.</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

const Row = ({ l, v, primary }) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{l}</span>
    <span className={primary ? "text-primary font-semibold" : "font-semibold"}>{v}</span>
  </div>
);
