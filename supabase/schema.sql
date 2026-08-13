-- YouTube Event Jukebox — run in Supabase SQL editor

create extension if not exists "pgcrypto";

-- Visitors (name + email registration)
create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists visitors_email_idx on public.visitors (lower(email));

-- Queue items
create table if not exists public.queue_items (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null,
  title text not null,
  channel text,
  thumbnail text,
  duration_sec int not null check (duration_sec > 0),
  visitor_id uuid references public.visitors (id) on delete set null,
  source text not null default 'web' check (source in ('web', 'sms')),
  status text not null default 'queued'
    check (status in ('queued', 'playing', 'hidden', 'played', 'removed')),
  position int not null,
  started_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists queue_items_status_position_idx
  on public.queue_items (status, position);

create index if not exists queue_items_active_idx
  on public.queue_items (position)
  where status in ('queued', 'playing', 'hidden');

-- Single-row settings
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  event_title text not null default 'Jukebox',
  -- Cap on how long a queued video actually plays (not a limit on adding)
  max_duration_sec int not null default 360 check (max_duration_sec between 30 and 1800),
  paused boolean not null default false,
  volume real not null default 0.85 check (volume >= 0 and volume <= 1),
  updated_at timestamptz not null default now()
);

alter table public.settings
  add column if not exists event_title text not null default 'Jukebox';

insert into public.settings (id) values (1)
on conflict (id) do nothing;

-- Assign position and restrict visitor inserts to queued status
create or replace function public.enforce_queue_insert()
returns trigger
language plpgsql
as $$
declare
  next_pos int;
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'queued' then
      raise exception 'Visitors may only insert queued items';
    end if;
    if new.position is null then
      select coalesce(max(position), 0) + 1 into next_pos from public.queue_items;
      new.position := next_pos;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists queue_items_enforce_insert on public.queue_items;
create trigger queue_items_enforce_insert
  before insert on public.queue_items
  for each row execute function public.enforce_queue_insert();

create or replace function public.touch_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch
  before update on public.settings
  for each row execute function public.touch_settings_updated_at();

-- Realtime (ignore errors if already added; or enable under Database → Replication)
do $$
begin
  alter publication supabase_realtime add table public.queue_items;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.settings;
exception when duplicate_object then null;
end $$;

-- RLS
alter table public.visitors enable row level security;
alter table public.queue_items enable row level security;
alter table public.settings enable row level security;

-- Visitors: anyone can register and read (for attribution names)
drop policy if exists visitors_insert_anon on public.visitors;
create policy visitors_insert_anon on public.visitors
  for insert to anon, authenticated
  with check (true);

drop policy if exists visitors_select_all on public.visitors;
create policy visitors_select_all on public.visitors
  for select to anon, authenticated
  using (true);

-- Queue: public can read non-removed; insert queued; staff can update
drop policy if exists queue_select_public on public.queue_items;
create policy queue_select_public on public.queue_items
  for select to anon, authenticated
  using (status <> 'removed' or auth.role() = 'authenticated');

drop policy if exists queue_insert_anon on public.queue_items;
create policy queue_insert_anon on public.queue_items
  for insert to anon, authenticated
  with check (status = 'queued');

drop policy if exists queue_update_staff on public.queue_items;
create policy queue_update_staff on public.queue_items
  for update to authenticated
  using (true)
  with check (true);

drop policy if exists queue_delete_staff on public.queue_items;
create policy queue_delete_staff on public.queue_items
  for delete to authenticated
  using (true);

-- Settings: public read; staff update
drop policy if exists settings_select_all on public.settings;
create policy settings_select_all on public.settings
  for select to anon, authenticated
  using (true);

drop policy if exists settings_update_staff on public.settings;
create policy settings_update_staff on public.settings
  for update to authenticated
  using (true)
  with check (true);
