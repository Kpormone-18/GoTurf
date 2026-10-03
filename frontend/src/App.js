import { useEffect } from "react";
import { LoadingScreen } from "./components/LoadingScreen";
import "./App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Navbar } from "./components/Navbar";
import { Toaster } from "./components/ui/sonner";
import Home from "./pages/Home";
import TurfProfile from "./pages/TurfProfile";
import Checkout from "./pages/Checkout";
import Confirmation from "./pages/Confirmation";
import PaymentCallback from "./pages/PaymentCallback";
import Auth from "./pages/Auth";
import MyBookings from "./pages/MyBookings";
import GuestLookup from "./pages/GuestLookup";
import OwnerDashboard from "./pages/OwnerDashboard";
import OwnerLogin from "./pages/OwnerLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLogin from "./pages/AdminLogin";
import LegalPlaceholder from "./pages/LegalPlaceholder";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

function AppContent() {
  const { pathname, search, hash } = useLocation();
  const preview = new URLSearchParams(search).get("preview") === "owner";
  useScrollImmersion(pathname);
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  useEffect(() => {
    const onAnchorClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (!anchor || anchor.classList.contains("skip-link")) return;
      const target = document.getElementById(anchor.getAttribute("href").slice(1));
      if (!target) return;
      event.preventDefault();
      window.history.pushState(null, "", anchor.getAttribute("href"));
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    };
    document.addEventListener("click", onAnchorClick);
    return () => document.removeEventListener("click", onAnchorClick);
  }, []);
  const { loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return (
    <>
      {!preview && <a href="#main-content" className="skip-link">Skip to content</a>}
      {!preview && <Navbar />}
      <main id="main-content" tabIndex={-1}>
        <AnimatedRoutes preview={preview} />
      </main>
      {!preview && <Toaster position="top-right" richColors />}
    </>
  );
}

function useScrollImmersion(pathname) {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return undefined;

    const targets = [...document.querySelectorAll("#main-content section, #main-content article, [data-scroll-reveal]")];
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("scroll-reveal--visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6%" });

    targets.forEach((target, index) => {
      target.classList.add("scroll-reveal");
      target.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 55}ms`);
      observer.observe(target);
    });

    let frame;
    const updateScrollProgress = () => {
      frame = undefined;
      const scrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(window.scrollY / scrollable, 1);
      document.documentElement.style.setProperty("--scroll-progress", String(progress));
      document.documentElement.style.setProperty("--scroll-atmosphere-x", `${progress * 48}px`);
      document.documentElement.style.setProperty("--scroll-atmosphere-y", `${progress * -72}px`);
      document.documentElement.style.setProperty("--scroll-atmosphere-scale", String(1 + progress * 0.12));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(updateScrollProgress); };
    updateScrollProgress();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      targets.forEach((target) => {
        target.classList.remove("scroll-reveal", "scroll-reveal--visible");
        target.style.removeProperty("--reveal-delay");
      });
    };
  }, [pathname]);
}

function AnimatedRoutes({ preview }) {
  const location = useLocation();
  const reducedMotion = useReducedMotion();
  const transition = { duration: 0.38, ease: [0.16, 1, 0.3, 1] };
  const motionProps = reducedMotion || preview ? {} : {
    initial: { opacity: 0, y: 14, scale: 0.992 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -8, scale: 0.996 },
    transition,
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location.pathname + location.search} className="route-motion" {...motionProps}>
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/turf/:id" element={<TurfProfile />} />
          <Route path="/checkout/:bookingId" element={<Checkout />} />
          <Route path="/confirmation/:bookingId" element={<Confirmation />} />
          <Route path="/payment/callback" element={<PaymentCallback />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/my-bookings" element={<MyBookings />} />
          <Route path="/lookup" element={<GuestLookup />} />
          <Route path="/owner/login" element={<OwnerLogin />} />
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/privacy" element={<LegalPlaceholder title="Privacy" />} />
          <Route path="/terms" element={<LegalPlaceholder title="Terms of use" />} />
          <Route path="/cancellation-policy" element={<LegalPlaceholder title="Cancellation policy" />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<div className="mx-auto max-w-lg px-5 py-20 text-center"><h1 className="font-display text-3xl font-bold">Page not found</h1><p className="mt-3 text-muted-foreground">Let’s get you back to the pitch.</p><a href="/" className="mt-6 inline-flex rounded-lg bg-primary px-5 py-3 font-semibold text-white">Back to Discover</a></div>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

export default App;
