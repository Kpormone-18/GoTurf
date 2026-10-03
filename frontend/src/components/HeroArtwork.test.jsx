import { act } from "react";
import { createRoot } from "react-dom/client";
import { HeroArtwork } from "./HeroArtwork";

test("scroll zoom is bounded and disabled for reduced motion", () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const preference = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
  window.matchMedia = jest.fn(() => preference);
  const section = document.createElement("section");
  document.body.appendChild(section);
  Object.defineProperty(section, "offsetHeight", { value: 500 });
  section.getBoundingClientRect = () => ({ top: -1000 });
  const root = createRoot(section);
  act(() => root.render(<HeroArtwork />));
  expect(section.firstChild.style.getPropertyValue("--hero-scale")).toBe("1.18");
  act(() => root.unmount());
  preference.matches = true;
  const reducedRoot = createRoot(section);
  act(() => reducedRoot.render(<HeroArtwork />));
  expect(section.firstChild.style.getPropertyValue("--hero-scale")).toBe("1");
  act(() => reducedRoot.unmount());
  section.remove();
});
