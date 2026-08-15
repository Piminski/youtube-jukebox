import { useEffect, useState } from "react";
import {
  clearLocalVisitor,
  loadLocalVisitor,
} from "../../supabase/api";
import { useQueue, useSettings } from "../../supabase/hooks";
import type { Visitor } from "../../supabase/types";
import { navigate } from "../../lib/route";
import AddVideo from "./AddVideo";
import QueueView from "./QueueView";
import Register from "./Register";

interface VisitorAppProps {
  view: "queue" | "add";
}

export default function VisitorApp({ view }: VisitorAppProps) {
  const [visitor, setVisitor] = useState<Visitor | null>(() => loadLocalVisitor());
  const [searchOpen, setSearchOpen] = useState(view === "add");
  const { settings, error: settingsError } = useSettings();
  const { playing, queued, loading, error, refresh } = useQueue();

  useEffect(() => {
    if (view === "add") setSearchOpen(true);
  }, [view]);

  if (!visitor) {
    return <Register onRegistered={setVisitor} />;
  }

  return (
    <>
      <div hidden={view !== "queue"}>
        <QueueView
          visitor={visitor}
          playing={playing}
          queued={queued}
          settings={settings}
          loading={loading}
          error={error || settingsError}
          onAdd={() => {
            setSearchOpen(true);
            navigate("search");
          }}
          onSignOut={() => {
            clearLocalVisitor();
            setVisitor(null);
            setSearchOpen(false);
            navigate("playlist");
          }}
        />
      </div>
      {searchOpen && (
        <div hidden={view !== "add"}>
          <AddVideo
            visitor={visitor}
            onBack={() => navigate("playlist")}
            onAdded={() => {
              void refresh();
            }}
            active={view === "add"}
          />
        </div>
      )}
    </>
  );
}
