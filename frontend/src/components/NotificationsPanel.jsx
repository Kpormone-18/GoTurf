import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";

export function NotificationsPanel({ owner = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const load = useCallback(() => api.get("/notifications").then((response) => setItems(response.data)).catch(() => {}), []);
  useEffect(() => { load(); const poll = window.setInterval(load, 15000); return () => window.clearInterval(poll); }, [load]);
  const unread = items.filter((item) => !item.read_at).length;
  const openItem = async (item) => {
    await api.post(`/notifications/${item.id}/read`).catch(() => {});
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
    if (item.booking_id) navigate(owner ? "/owner" : `/my-bookings?chat=${item.booking_id}`);
    setOpen(false);
  };
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label="Notifications" className={owner ? "relative text-white hover:bg-white/10" : "relative"}><Bell className="h-4 w-4" />{unread > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">{Math.min(unread, 9)}</span>}</Button></SheetTrigger>
    <SheetContent className="w-full sm:w-[420px] sm:max-w-none"><SheetHeader><SheetTitle>Notifications</SheetTitle><SheetDescription>Booking, payment, and message updates.</SheetDescription></SheetHeader><div className="mt-6 space-y-2 overflow-y-auto"><>{items.length ? items.map((item) => <button key={item.id} onClick={() => openItem(item)} className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent ${item.read_at ? "border-border bg-white" : "border-primary/30 bg-accent/40"}`}><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.body}</p><p className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p></button>) : <p className="py-12 text-center text-sm text-muted-foreground">No updates yet.</p>}</></div></SheetContent>
  </Sheet>;
}
