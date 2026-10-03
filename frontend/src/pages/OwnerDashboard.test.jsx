import { act } from "react";
import { createRoot } from "react-dom/client";
import OwnerDashboard from "./OwnerDashboard";
import { api } from "../lib/api";

const mockOwner = { role: "owner" };
jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: mockOwner, loading: false }) }));
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate, useSearchParams: () => [new URLSearchParams()] }));
const mockNavigate = jest.fn();
jest.mock("../lib/api", () => ({ api: { get: jest.fn() }, ghs: n => `GHS ${n || 0}`, formatApiError: () => "Request failed" }));
jest.mock("recharts", () => ({ ResponsiveContainer: () => <div>Booking chart</div>, Area: () => null, AreaChart: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null }));

test("owner overview retains navigation and handles a failed dashboard request", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.appendChild(host);
  const root = createRoot(host);
  api.get.mockImplementation(url => Promise.resolve({ data: url === "/owner/overview" ? { verified: true, revenue: 0, pending_payout: 0, booking_count: 0 } : [] }));
  try {
    await act(async () => root.render(<OwnerDashboard />));
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(host.textContent).toContain("No booking activity yet.");
    await act(async () => host.querySelector('[data-testid="owner-tab-turfs"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(host.textContent).toContain("Keep your listings accurate");
    api.get.mockRejectedValue(new Error("Offline"));
    await act(async () => root.render(<OwnerDashboard key="offline" />));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).toContain("Try again");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
