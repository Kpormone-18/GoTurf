import { BrandMark } from "./BrandMark";
import { NotificationsPanel } from "./NotificationsPanel";
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetClose } from "./ui/sheet";
import { LogOut, Search, ShieldCheck, Building2, Menu, Ticket, ArrowUpRight } from "lucide-react";

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Hide the top bar entirely on dedicated portal login screens.
  if (["/owner/login", "/admin/login", "/payment/callback"].includes(pathname)) return null;

  const isOwner = pathname.startsWith("/owner");
  const isAdmin = pathname.startsWith("/admin");

  if (isOwner || isAdmin) {
    const label = isAdmin ? "Admin" : null;
    const Icon = isAdmin ? ShieldCheck : Building2;
    return (
      <header className={`sticky top-0 z-50 ${isAdmin ? "bg-slate-900" : "bg-[#06281f]"} text-white border-b border-white/10`}>
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandMark className="h-10 w-10 brightness-200" />
            <span className="font-display font-black text-lg tracking-tight">GoTurf</span>
            {label && <span className="text-[10px] font-bold uppercase tracking-wider text-white/70 flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</span>}
          </div>
          <div className="flex items-center gap-2">
            {user && <NotificationsPanel owner={isOwner} />}
            {user && isOwner && (
              <Popover open={logoutOpen} onOpenChange={setLogoutOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="nav-logout" aria-label="Exit console" className="text-white hover:bg-white/10"><LogOut className="w-4 h-4" /></Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-3">
                  <p className="text-sm font-bold">Log out of the owner console?</p>
                  <p className="mt-1 text-xs text-muted-foreground">You will return to Discover.</p>
                  <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setLogoutOpen(false)}>No</Button><Button size="sm" onClick={() => { logout(); navigate("/"); }}>Yes, log out</Button></div>
                </PopoverContent>
              </Popover>
            )}
            {user && isAdmin && (
              <Button variant="ghost" size="sm" data-testid="nav-logout" aria-label="Exit console" className="text-white hover:bg-white/10"
                onClick={() => { logout(); navigate("/admin/login"); }}>
                <LogOut className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 glass-nav border-b border-border">
      <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" data-testid="nav-logo" className="flex items-center gap-2">
          <BrandMark className="h-10 w-10" />
          <span className="font-display font-black text-xl tracking-tight">GoTurf</span>
        </Link>

        <nav aria-label="Main navigation" className="flex items-center gap-1 md:gap-3">
          <Link to="/#discover" data-testid="nav-discover" className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground px-2">
            <Search className="w-4 h-4" /> Discover
          </Link>
          <Link to="/lookup" data-testid="nav-lookup" className="hidden md:inline text-sm font-semibold text-muted-foreground hover:text-foreground px-2">
            Find booking
          </Link>
          <a href="/owner" data-testid="nav-owner-portal" className="hidden md:inline text-sm font-semibold text-muted-foreground hover:text-foreground px-2">
            List your turf
          </a>

          {user && user.role === "customer" ? (
            <>
              <Button variant="outline" size="sm" className="hidden md:inline-flex" data-testid="nav-bookings" onClick={() => navigate("/my-bookings")}>My bookings</Button>
              <NotificationsPanel />
              <Button variant="ghost" size="sm" aria-label="Log out" data-testid="nav-logout" onClick={() => { logout(); navigate("/"); }}><LogOut className="w-4 h-4" /></Button>
            </>
          ) : (
            <Button size="sm" data-testid="nav-login" onClick={() => navigate("/auth")} className="bg-primary hover:bg-primary/90">Sign in</Button>
          )}
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation"><Menu /></Button></SheetTrigger>
            <SheetContent className="w-[min(90vw,360px)] overflow-y-auto">
              <BrandMark className="h-12 w-12 mb-6" />
              <SheetTitle className="font-display text-2xl font-bold">Your next match awaits.</SheetTitle>
              <SheetDescription className="mt-2">Find your pitch. Make time to play.</SheetDescription>
              <nav aria-label="Mobile navigation" className="mt-8 space-y-2">
                {[["/#discover", "Discover pitches", Search], ["/lookup", "Find a booking", Ticket], ["/owner", "Owner console", Building2], ...(user?.role === "customer" ? [["/my-bookings", "My bookings", ShieldCheck]] : [])].map(([to, label, Icon]) => (
                  <SheetClose asChild key={to}><Link to={to} className="flex min-h-12 items-center gap-3 rounded-lg px-3 py-3 font-semibold hover:bg-accent focus-visible:bg-accent"><Icon className="h-5 w-5 text-primary" />{label}<ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground" /></Link></SheetClose>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </nav>
      </div>
    </header>
  );
};
