import { PageError } from "../components/PageError";
import { useEffect, useState, useCallback } from "react";
import { LoadingScreen } from "../components/LoadingScreen";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, formatApiError, ghs } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CountdownTimer } from "../components/CountdownTimer";
import { BookingChatDialog } from "../components/BookingChatDialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "../components/ui/dialog";
import { Separator } from "../components/ui/separator";
import { toast } from "sonner";
import { Star, CalendarClock } from "lucide-react";

const statusStyle = {
  confirmed: "bg-accent text-primary",
  pending_payment: "bg-amber-50 text-amber-700",
  cancelled_by_customer: "bg-red-50 text-red-600",
  cancelled_by_owner: "bg-red-50 text-red-600",
  refunded: "bg-secondary text-muted-foreground",
};

export default function MyBookings() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loadError, setLoadError] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [fetching, setFetching] = useState(true);

  const load = useCallback(() => {
    setFetching(true); setLoadError(false);
    api.get("/me/bookings").then((r) => setBookings(r.data))
      .catch(() => setLoadError(true))
      .finally(() => setFetching(false));
  }, []);
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/auth"); return; }
    load();
  }, [user, loading, navigate, load]);

  const cancel = async (b) => {
    try {
      const { data } = await api.post(`/bookings/${b.id}/cancel`);
      toast.success(`Cancelled. Refund ${ghs(data.refund.refund_amount)}`);
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const now = Date.now();
  if (loadError) return <PageError onRetry={load} />;
  if (loading || fetching) return <LoadingScreen label="Loading your bookings" />;
  const isPast = (b) => new Date(b.end_datetime).getTime() < now;

  return (
    <div className="max-w-4xl mx-auto px-5 lg:px-8 py-10">
      <h1 className="font-display font-black text-3xl mb-1">My bookings</h1>
      <p className="text-sm text-muted-foreground mb-6">Manage upcoming sessions, cancel, reschedule and leave reviews.</p>

      {bookings.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground bg-white border border-border rounded-2xl">
          <p className="font-semibold">No bookings yet.</p>
          <Button className="mt-4 bg-primary hover:bg-primary/90" onClick={() => navigate("/")}>Find a pitch</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => (
            <div key={b.id} className="bg-white border border-border rounded-2xl p-5" data-testid={`booking-${b.id}`}>
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <h2 className="font-display font-extrabold text-lg">{b.turf_name}</h2>
                  <p className="text-sm text-muted-foreground">{b.date} · {String(b.start_hour).padStart(2, "0")}:00 for {b.duration}h</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Ref {b.reference} · {ghs(b.amount_paid || b.total)}</p>
                </div>
                <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded ${statusStyle[b.status] || "bg-secondary"}`}>
                  {b.status.replace(/_/g, " ")}
                </span>
              </div>

              {b.status === "confirmed" && !isPast(b) && (
                <>
                  <div className="mt-4 bg-accent/40 rounded-lg p-3">
                    <CountdownTimer seconds={b.refund?.seconds_remaining} deadline={b.refund?.full_refund_deadline} />
                    <p className="text-xs text-muted-foreground mt-1">
                      {b.refund?.full_refund_available
                        ? "Cancel now for a 100% refund."
                        : `After this window a GHS 30 penalty applies — you'd get back ${ghs(b.refund?.refund_amount)}.`}
                    </p>
                  </div>
                  {b.reschedule_request?.status === "pending" && (
                    <p className="text-xs text-amber-700 mt-2">Reschedule request pending owner approval…</p>
                  )}
                  {b.reschedule_request?.status === "rejected" && (
                    <p className="text-xs text-red-600 mt-2">Reschedule request was rejected by the owner.</p>
                  )}
                  <div className="flex flex-wrap gap-2 mt-4">
                    <RescheduleDialog booking={b} onDone={load} />
                    <Button variant="destructive" size="sm" data-testid={`cancel-${b.id}`} onClick={() => cancel(b)}>Cancel booking</Button>
                  </div>
                </>
              )}

              {b.status === "confirmed" && isPast(b) && (
                <div className="mt-4"><ReviewDialog booking={b} onDone={load} /></div>
              )}

              <div className="mt-4 border-t border-border pt-3"><BookingChatDialog booking={b} openOnMount={searchParams.get("chat") === b.id} /></div>

              {b.status === "cancelled_by_owner" && b.cancellation?.recovery_coupon && (
                <div className="mt-3 text-xs bg-accent text-primary font-semibold rounded-lg px-3 py-2">
                  Owner cancelled — use code <strong>{b.cancellation.recovery_coupon}</strong> for 20% off your next booking here.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RescheduleDialog({ booking, onDone }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ new_date: booking.date, new_start_hour: booking.start_hour, new_duration: booking.duration });

  const submit = async () => {
    try {
      await api.post(`/bookings/${booking.id}/reschedule-request`, {
        new_date: f.new_date, new_start_hour: Number(f.new_start_hour), new_duration: Number(f.new_duration),
      });
      toast.success("Reschedule requested — awaiting owner approval");
      setOpen(false); onDone();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm" data-testid={`reschedule-${booking.id}`}><CalendarClock className="w-4 h-4 mr-1.5" /> Reschedule</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request reschedule</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Rescheduling isn't guaranteed — the owner must approve your new time.</p>
        <div className="space-y-3 mt-2">
          <div><Label>New date</Label><Input type="date" data-testid="rs-date" value={f.new_date} onChange={(e) => setF({ ...f, new_date: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start hour</Label><Input type="number" min="6" max="22" data-testid="rs-hour" value={f.new_start_hour} onChange={(e) => setF({ ...f, new_start_hour: e.target.value })} /></div>
            <div><Label>Duration (h)</Label><Input type="number" min="1" max="24" data-testid="rs-dur" value={f.new_duration} onChange={(e) => setF({ ...f, new_duration: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={submit} data-testid="rs-submit" className="bg-primary hover:bg-primary/90">Send request</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ booking, onDone }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const submit = async () => {
    try {
      await api.post(`/turfs/${booking.turf_id}/reviews`, { booking_id: booking.id, rating, comment });
      toast.success("Thanks for your review!");
      setOpen(false); onDone();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm" data-testid={`review-${booking.id}`}><Star className="w-4 h-4 mr-1.5" /> Leave a review</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Review {booking.turf_name}</DialogTitle></DialogHeader>
        <div className="flex gap-1 my-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} data-testid={`star-${n}`} onClick={() => setRating(n)}>
              <Star className={`w-7 h-7 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
        <div><Label>Comment</Label><Input data-testid="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="How was the pitch?" /></div>
        <DialogFooter><Button onClick={submit} data-testid="review-submit" className="bg-primary hover:bg-primary/90">Submit review</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
