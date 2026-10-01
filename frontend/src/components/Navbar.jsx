import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import { ShieldCheck, LogOut, LayoutDashboard, Search } from "lucide-react";

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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

          {user ? (
            <>
              {(user.role === "owner") && (
                <Button variant="outline" size="sm" data-testid="nav-owner" onClick={() => navigate("/owner")}>
                  <LayoutDashboard className="w-4 h-4 mr-1.5" /> Owner
                </Button>
              )}
              {user.role === "admin" && (
                <Button variant="outline" size="sm" data-testid="nav-admin" onClick={() => navigate("/admin")}>
                  <ShieldCheck className="w-4 h-4 mr-1.5" /> Admin
                </Button>
              )}
              {user.role === "customer" && (
                <Button variant="outline" size="sm" data-testid="nav-bookings" onClick={() => navigate("/my-bookings")}>
                  My bookings
                </Button>
              )}
              <Button variant="ghost" size="sm" data-testid="nav-logout" onClick={() => { logout(); navigate("/"); }}>
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button size="sm" data-testid="nav-login" onClick={() => navigate("/auth")} className="bg-primary hover:bg-primary/90">
              Sign in
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
};
