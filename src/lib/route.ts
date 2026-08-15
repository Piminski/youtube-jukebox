export type AppRoute = "playlist" | "search" | "admin" | "display";

export const ROUTE_TITLES: Record<AppRoute, string> = {
  playlist: "Playlist",
  search: "Search",
  admin: "Admin",
  display: "Display",
};

export function parseRoute(pathname = window.location.pathname): AppRoute {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  if (path === "/display" || path.startsWith("/display/")) return "display";
  if (path === "/search" || path.startsWith("/search/")) return "search";
  return "playlist";
}

export function routePath(route: AppRoute): string {
  return route === "playlist" ? "/" : `/${route}`;
}

export function navigate(route: AppRoute) {
  const path = routePath(route);
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}
