import { renderToStaticMarkup } from "react-dom/server";
import { LoadingScreen } from "./LoadingScreen";
import { BrandMark } from "./BrandMark";

test("page and section loaders share the emblem and accessible status", () => {
  const page = renderToStaticMarkup(<LoadingScreen label="Preparing your booking" />);
  expect(page).toContain('brand-loading--page');
  expect(page).toContain('role="status"');
  expect(page).toContain('aria-label="Preparing your booking"');
  expect(page).toContain('/brand/goturf-emblem.png');
  expect(renderToStaticMarkup(<LoadingScreen inline />)).toContain('brand-loading--inline');
  expect(renderToStaticMarkup(<BrandMark decorative={false} />)).toContain('alt="GoTurf"');
});
