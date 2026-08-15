import { useEffect, useState } from "react";
import AdminApp from "./components/admin/AdminApp";
import DisplayScreen from "./components/display/DisplayScreen";
import VisitorApp from "./components/visitor/VisitorApp";
import { parseRoute, ROUTE_TITLES, type AppRoute } from "./lib/route";
import { supabaseConfigured } from "./supabase/client";

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseRoute());

  useEffect(() => {
    const onNav = () => setRoute(parseRoute());
    window.addEventListener("popstate", onNav);
    return () => window.removeEventListener("popstate", onNav);
  }, []);

  useEffect(() => {
    document.title = ROUTE_TITLES[route];
  }, [route]);

  if (!supabaseConfigured() && route !== "display") {
    return (
      <div className="shell visitor-shell">
        <header className="brand-block">
          <h1>YouTube Jukebox</h1>
          <p className="lede">
            Add <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env</code>, then run the
            SQL in <code>supabase/schema.sql</code>.
          </p>
        </header>
      </div>
    );
  }

  if (route === "admin") return <AdminApp />;
  if (route === "display") return <DisplayScreen />;
  return <VisitorApp view={route === "search" ? "add" : "queue"} />;
}
