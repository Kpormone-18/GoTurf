import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api, formatApiError, getToken } from "../lib/api";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

const today = () => new Date().toISOString().slice(0, 10);

export function BookingChatDialog({ booking, openOnMount = false, trigger }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(today());
  const [days, setDays] = useState([]);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => { if (openOnMount) setOpen(true); }, [openOnMount]);

  const setChatOpen = (next) => {
    if (next && !getToken()) {
      toast.error("Sign in to message about this booking");
      navigate("/auth");
      return;
    }
    setOpen(next);
  };

  const availableDays = useMemo(() => Array.from(new Set([today(), ...days])).sort().reverse(), [days]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/bookings/${booking.id}/messages`, { params: { day } });
      setMessages(data.messages);
      setDays(data.days);
    } catch (err) {
      if (err.response?.status !== 401) toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, [booking.id, day]);

  useEffect(() => {
    if (!open) return undefined;
    load();
    const refresh = window.setInterval(load, 15000);
    return () => window.clearInterval(refresh);
  }, [open, load]);

  const send = async (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setSending(true);
    try {
      await api.post(`/bookings/${booking.id}/messages`, { text: value });
      setText("");
      if (day === today()) await load();
      else setDay(today());
    } catch (err) {
      if (err.response?.status !== 401) toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setChatOpen}>
      <SheetTrigger asChild>
        {trigger || <Button variant="outline" size="sm" data-testid={`booking-chat-${booking.id}`}><MessageCircle className="mr-1.5 h-4 w-4" />Message</Button>}
      </SheetTrigger>
      <SheetContent className="flex h-[100dvh] w-full flex-col overflow-hidden p-5 sm:w-[min(42vw,620px)] sm:max-w-none sm:resize-x sm:overflow-auto">
        <SheetHeader>
          <SheetTitle>Booking conversation</SheetTitle>
          <SheetDescription>{booking.turf_name} · Ref {booking.reference}. Messages are grouped by day and kept with this booking for support.</SheetDescription>
        </SheetHeader>
        <label className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Conversation day
          <select aria-label="Conversation day" value={day} onChange={(event) => setDay(event.target.value)} className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring">
            {availableDays.map((value) => <option key={value} value={value}>{value === today() ? "Today" : value}</option>)}
          </select>
        </label>
        <div className="min-h-56 flex-1 space-y-3 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3" aria-live="polite">
          {loading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading conversation…</p> : messages.length === 0 ? <p className="py-12 text-center text-sm text-muted-foreground">No messages for this day. Start the conversation about a reschedule or booking detail.</p> : messages.map((message) => {
            const mine = message.sender_id === user?.id;
            return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-white text-foreground shadow-sm"}`}>
                <p className={`mb-0.5 text-[11px] font-bold ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{mine ? "You" : message.sender_name}</p>
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
                <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>;
          })}
        </div>
        <form onSubmit={send} className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`message-${booking.id}`}>Message</label>
          <textarea id={`message-${booking.id}`} value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} rows={2} placeholder="Write a message…" className="flex min-h-11 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          <Button type="submit" className="bg-primary hover:bg-primary/90" disabled={sending || !text.trim()} aria-label="Send message"><Send className="h-4 w-4" /></Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
