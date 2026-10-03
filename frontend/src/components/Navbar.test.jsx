import { act } from "react";
import { createRoot } from "react-dom/client";
import { Navbar } from "./Navbar";

jest.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null, logout: jest.fn() }) }));
jest.mock("react-router-dom", () => ({
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
  useNavigate: () => jest.fn(), useLocation: () => ({ pathname: "/" }),
}));

test("mobile navigation exposes discovery, booking lookup and owner access", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Navbar />));
    const trigger = host.querySelector('[aria-label="Open navigation"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger.click());
    const menu = document.querySelector('[aria-label="Mobile navigation"]');
    expect(menu).not.toBeNull();
    expect([...menu.querySelectorAll("a")].map(a => a.getAttribute("href"))).toEqual(expect.arrayContaining(["/#discover", "/lookup", "/owner"]));
    await act(async () => menu.querySelector("a").click());
    expect(document.querySelector('[aria-label="Mobile navigation"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
