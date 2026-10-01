import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { LogOut, Search, ShieldCheck, Building2 } from "lucide-react";

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Hide the top bar entirely on dedicated portal login screens.
  if (["/owner/login", "/admin/login", "/payment/callback"].includes(pathname)) return null;

  const isOwner = pathname.startsWith("/owner");
  const isAdmin = pathname.startsWith("/admin");

  if (isOwner || isAdmin) {
    const label = isAdmin ? "Admin Console" : "Owner Console";
    const Icon = isAdmin ? ShieldCheck : Building2;
    const accent = isAdmin ? "bg-slate-900" : "bg-primary";
    return (
      <header className={`sticky top-0 z-50 ${isAdmin ? "bg-slate-900" : "bg-[#06281f]"} text-white border-b border-white/10`}>
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg ${accent} grid place-items-center font-display font-black`}>G</span>
            <span className="font-display font-black text-lg tracking-tight">GoTurf</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 flex items-center gap-1">
              <Icon className="w-3 h-3" /> {label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a href="/" className="text-xs font-semibold text-white/70 hover:text-white px-2">Customer site</a>
            {user && (
              <Button variant="ghost" size="sm" data-testid="nav-logout" className="text-white hover:bg-white/10"
                onClick={() => { logout(); navigate(isAdmin ? "/admin/login" : "/owner/login"); }}>
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
          <span className="w-9 h-9 rounded-lg bg-primary grid place-items-center text-primary-foreground font-display font-black text-lg">G</span>
          <span className="font-display font-black text-xl tracking-tight">GoTurf</span>
          <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-[0.2em] text-primary bg-accent px-2 py-0.5 rounded">Accra</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          <Link to="/" data-testid="nav-discover" className="hidden sm:flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground px-2">
            <Search className="w-4 h-4" /> Discover
          </Link>
          <Link to="/lookup" data-testid="nav-lookup" className="hidden sm:inline text-sm font-semibold text-muted-foreground hover:text-foreground px-2">
            Find booking
          </Link>
          <a href="/owner" data-testid="nav-owner-portal" className="hidden md:inline text-sm font-semibold text-muted-foreground hover:text-foreground px-2">
            List your turf
          </a>

          {user && user.role === "customer" ? (
            <>
              <Button variant="outline" size="sm" data-testid="nav-bookings" onClick={() => navigate("/my-bookings")}>My bookings</Button>
              <Button variant="ghost" size="sm" data-testid="nav-logout" onClick={() => { logout(); navigate("/"); }}><LogOut className="w-4 h-4" /></Button>
            </>
          ) : (
            <Button size="sm" data-testid="nav-login" onClick={() => navigate("/auth")} className="bg-primary hover:bg-primary/90">Sign in</Button>
          )}
        </nav>
      </div>
    </header>
  );
};
