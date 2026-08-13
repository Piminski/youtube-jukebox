export type QueueStatus = "queued" | "playing" | "hidden" | "played" | "removed";
export type QueueSource = "web" | "sms";

export interface Visitor {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface QueueItem {
  id: string;
  youtube_id: string;
  title: string;
  channel: string | null;
  thumbnail: string | null;
  duration_sec: number;
  visitor_id: string | null;
  source: QueueSource;
  status: QueueStatus;
  position: number;
  started_at: string | null;
  created_at: string;
  visitor?: Visitor | null;
}

export interface Settings {
  id: number;
  event_title: string;
  max_duration_sec: number;
  paused: boolean;
  volume: number;
  playlist_loop: boolean;
  updated_at: string;
}

export interface AddVideoInput {
  youtube_id: string;
  title: string;
  channel?: string;
  thumbnail?: string;
  duration_sec: number;
  visitor_id: string;
}
