export type AppRoute = "visitor" | "admin" | "display";

export function parseRoute(pathname = window.location.pathname): AppRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (path === "/display" || path.startsWith("/display/")) return "display";
  return "visitor";
}

export function navigate(route: AppRoute) {
  const path = route === "visitor" ? "/" : `/${route}`;
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}
