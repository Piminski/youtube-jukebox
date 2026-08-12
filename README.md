# YouTube Event Jukebox

Public event jukebox: visitors register with name + email, search YouTube, and add
videos to a shared queue. Staff run playback from `/admin`; the room screen uses
`/display`.

Forked from the [miumiu-prototype](https://github.com/Piminski/miumiu-prototype)
jukebox path (YouTube search, preview, and in-room player), with Beat/Play/Sampler
removed and `localStorage` replaced by **Supabase Realtime**.

## Surfaces

| URL | Role |
| --- | --- |
| `/` | Visitor — register, view queue, add videos |
| `/admin` | Staff — reorder, hide, delete, pause/skip, max play duration, playback host |
| `/display` | Public screen — now playing + up next |

The **admin device** is the audio host (YouTube IFrame). Open `/display` fullscreen
on the venue screen.

## Setup

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
3. Create a staff user under **Authentication → Users** (email/password).
4. Copy [`.env.example`](.env.example) → `.env` and fill:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_YOUTUBE_API_KEY` (restrict by HTTP referrer)
5. Install and run:

```bash
npm install
npm run dev
```

See [DEPLOY.md](DEPLOY.md) for Vercel + event-night notes.

## Phase 2 (not built)

Text a YouTube link to the queue (Twilio → Edge Function → `queue_items` with
`source = 'sms'`). The schema already includes the `source` column.
