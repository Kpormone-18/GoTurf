import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
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

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Navbar />
          <Routes>
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
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminDashboard />} />
          </Routes>
          <Toaster position="top-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
