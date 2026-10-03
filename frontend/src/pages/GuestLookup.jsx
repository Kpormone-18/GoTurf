import { useState } from "react";
import { api, formatApiError, ghs } from "../lib/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CountdownTimer } from "../components/CountdownTimer";
import { toast } from "sonner";
import { Search, Ticket } from "lucide-react";

export default function GuestLookup() {
  const [reference, setReference] = useState("");
  const [contact, setContact] = useState("");
  const [booking, setBooking] = useState(null);
  const [busy, setBusy] = useState(false);

  const find = async (e) => {
    e.preventDefault(); setBusy(true); setBooking(null);
    try {
      const { data } = await api.get("/bookings/lookup", { params: { reference, contact } });
      setBooking(data);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    try {
      const { data } = await api.post(`/bookings/${booking.id}/cancel`, null, { params: { contact } });
      toast.success(`Cancelled. Refund: ${ghs(data.refund.refund_amount)}`);
      const { data: b } = await api.get(`/bookings/${booking.id}`);
      setBooking(b);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <div className="max-w-xl mx-auto px-5 py-16">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-accent px-3 py-1.5 rounded-full mb-4">
          <Ticket className="w-4 h-4" /> Guest booking lookup
        </div>
        <h1 className="font-display font-black text-3xl">Find your booking</h1>
        <p className="text-sm text-muted-foreground mt-1">Enter your reference and the email or phone you used.</p>
      </div>

      <form onSubmit={find} className="bg-white border border-border rounded-2xl p-6 space-y-4">
        <div><Label htmlFor="lookup-reference">Booking reference</Label><Input id="lookup-reference" data-testid="lookup-reference" placeholder="GT-XXXXXX" required value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div><Label htmlFor="lookup-contact">Email or phone</Label><Input id="lookup-contact" data-testid="lookup-contact" required value={contact} onChange={(e) => setContact(e.target.value)} /></div>
        <Button data-testid="lookup-submit" disabled={busy} className="w-full bg-primary hover:bg-primary/90">
          <Search className="w-4 h-4 mr-1.5" /> {busy ? "Searching…" : "Find booking"}
        </Button>
      </form>

      {booking && (
        <div className="bg-white border border-border rounded-2xl p-6 mt-6 animate-fade-up" data-testid="lookup-result">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="font-display font-extrabold text-xl">{booking.turf_name}</h2>
              <p className="text-sm text-muted-foreground">{booking.date} · {String(booking.start_hour).padStart(2, "0")}:00 for {booking.duration}h</p>
            </div>
            <span className="text-xs font-bold uppercase bg-accent text-primary px-2 py-1 rounded">{booking.status.replace(/_/g, " ")}</span>
          </div>
          <div className="mt-4 flex justify-between text-sm"><span className="text-muted-foreground">Reference</span><span className="font-bold">{booking.reference}</span></div>
          <div className="mt-1 flex justify-between text-sm"><span className="text-muted-foreground">Amount</span><span className="font-bold">{ghs(booking.amount_paid || booking.total)}</span></div>

          {["confirmed", "pending_payment"].includes(booking.status) && (
            <div className="mt-5 pt-5 border-t border-border">
              <div className="bg-accent/50 rounded-lg p-3 mb-3">
                <CountdownTimer seconds={booking.refund?.seconds_remaining} deadline={booking.refund?.full_refund_deadline} />
                <p className="text-xs text-muted-foreground mt-1">
                  {booking.refund?.full_refund_available
                    ? "Cancel now for a 100% refund."
                    : `After this window a GHS 30 penalty applies. You'd get back ${ghs(booking.refund?.refund_amount)}.`}
                </p>
              </div>
              <Button variant="destructive" className="w-full" data-testid="lookup-cancel" onClick={cancel}>Cancel booking</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
