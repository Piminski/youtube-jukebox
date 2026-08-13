# Deploy — YouTube Event Jukebox

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql).
3. If Realtime complains that a table is already in the publication, skip those
   `alter publication` lines — enable **Database → Replication** for
   `queue_items` and `settings` instead.
4. **Authentication → Users → Add user**: create the staff email/password used
   at `/admin`.
5. Copy **Project URL** and **anon public** key from **Settings → API**.

If this project already exists, re-run [`supabase/schema.sql`](supabase/schema.sql)
(it is safe to re-run). That adds `play_count` and `submit_ordinal` on
`queue_items`, backfills ordinals, and updates the insert trigger so new
videos rank by fewest plays, then each user’s 1st/2nd/3rd request.

## 2. YouTube Data API

1. In Google Cloud Console, enable **YouTube Data API v3**.
2. Create an API key; restrict it by **HTTP referrer** to your Vercel domain
   (and `http://localhost:5173/*` for local dev).
3. Quota note: `search.list` costs 100 units; default is 10,000/day (~100 searches).
   Request a quota increase before a busy event.

## 3. Vercel

1. Import this repo into Vercel.
2. Framework preset: Vite.
3. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_YOUTUBE_API_KEY`
4. Deploy. SPA rewrites are in [`vercel.json`](vercel.json).

## 4. Event night

1. On the **admin laptop/iPad**:
   - Open `https://YOUR_DOMAIN/admin`
   - Sign in
   - Use Queue / Playback / Settings to run the night
2. On the **public screen** (connected to the room speakers/HDMI):
   - Open `https://YOUR_DOMAIN/display` fullscreen
   - Click once to unlock audio
3. Visitors join at `https://YOUR_DOMAIN/`

### Checklist

- [ ] Staff user can sign in
- [ ] Visitor can register and add a video of any length
- [ ] Admin max play duration caps how long each track plays
- [ ] Admin can reorder / hide / delete / skip
- [ ] Playlist loops by default (Loop On in admin transport)
- [ ] Display updates within a second or two
- [ ] Room audio plays from the display screen

## Optional site password

This build is public by design. If you need a soft gate before doors open, add
Vercel Deployment Protection or a simple Edge Basic Auth layer.
