import { useState } from "react";
import {
  clearLocalVisitor,
  loadLocalVisitor,
} from "../../supabase/api";
import { useQueue, useSettings } from "../../supabase/hooks";
import type { Visitor } from "../../supabase/types";
import AddVideo from "./AddVideo";
import QueueView from "./QueueView";
import Register from "./Register";

type View = "queue" | "add";

export default function VisitorApp() {
  const [visitor, setVisitor] = useState<Visitor | null>(() => loadLocalVisitor());
  const [view, setView] = useState<View>("queue");
  const [searchOpen, setSearchOpen] = useState(false);
  const { settings, error: settingsError } = useSettings();
  const { playing, queued, loading, error, refresh } = useQueue();

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
            setView("add");
          }}
          onSignOut={() => {
            clearLocalVisitor();
            setVisitor(null);
            setView("queue");
            setSearchOpen(false);
          }}
        />
      </div>
      {searchOpen && (
        <div hidden={view !== "add"}>
          <AddVideo
            visitor={visitor}
            onBack={() => setView("queue")}
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
