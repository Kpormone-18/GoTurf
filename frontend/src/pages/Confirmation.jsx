import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, ghs } from "../lib/api";
import { Button } from "../components/ui/button";
import { Separator } from "../components/ui/separator";
import { CheckCircle2, ShieldCheck, Mail, Copy, CalendarDays } from "lucide-react";
import { toast } from "sonner";

export default function Confirmation() {
  const { bookingId } = useParams();
  const [b, setB] = useState(null);

  useEffect(() => { api.get(`/bookings/${bookingId}`).then((r) => setB(r.data)); }, [bookingId]);
  if (!b) return <div className="max-w-xl mx-auto px-5 py-20 text-muted-foreground">Loading…</div>;

  return (
    <div className="max-w-xl mx-auto px-5 py-14">
      <div className="text-center animate-fade-up">
        <div className="w-16 h-16 rounded-full bg-accent grid place-items-center mx-auto mb-4">
          <CheckCircle2 className="w-9 h-9 text-primary" />
        </div>
        <h1 className="font-display font-black text-3xl">Booking confirmed!</h1>
        <p className="text-muted-foreground mt-1">Your pitch is locked in. See you on the turf.</p>
      </div>

      <div className="bg-white border border-border rounded-2xl p-6 mt-8" data-testid="confirmation-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground">Reference</div>
            <div className="font-display font-black text-2xl">{b.reference}</div>
          </div>
          <Button variant="outline" size="sm" data-testid="copy-ref" onClick={() => { navigator.clipboard.writeText(b.reference); toast.success("Reference copied"); }}>
            <Copy className="w-4 h-4 mr-1.5" /> Copy
          </Button>
        </div>
        <Separator className="my-4" />
        <h2 className="font-display font-extrabold text-xl">{b.turf_name}</h2>
        <div className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-semibold">{b.date}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Kickoff</span><span className="font-semibold">{String(b.start_hour).padStart(2, "0")}:00 · {b.duration}h</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span className="font-semibold">{ghs(b.amount_paid)}</span></div>
        </div>
        <div className="mt-5 flex items-center gap-2 text-sm text-primary font-semibold bg-accent rounded-lg px-3 py-2">
          <ShieldCheck className="w-4 h-4" /> Payment held in escrow until your session ends
        </div>
        {b.customer?.email && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="w-3.5 h-3.5" /> A receipt was emailed to {b.customer.email}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mt-6">
        <Link to="/lookup"><Button variant="outline" className="w-full" data-testid="manage-booking">Manage booking</Button></Link>
        <Link to="/"><Button className="w-full bg-primary hover:bg-primary/90" data-testid="book-another"><CalendarDays className="w-4 h-4 mr-1.5" /> Book another</Button></Link>
      </div>
    </div>
  );
}
