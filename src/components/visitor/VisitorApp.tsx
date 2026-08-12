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
  const { settings, error: settingsError } = useSettings();
  const { playing, queued, loading, error, refresh } = useQueue();

  if (!visitor) {
    return <Register onRegistered={setVisitor} />;
  }

  if (view === "add") {
    return (
      <AddVideo
        visitor={visitor}
        onBack={() => setView("queue")}
        onAdded={() => {
          void refresh();
          setView("queue");
        }}
      />
    );
  }

  return (
    <QueueView
      visitor={visitor}
      playing={playing}
      queued={queued}
      settings={settings}
      loading={loading}
      error={error || settingsError}
      onAdd={() => setView("add")}
      onSignOut={() => {
        clearLocalVisitor();
        setVisitor(null);
      }}
    />
  );
}
