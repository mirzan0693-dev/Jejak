-- Jejak database (already applied to project wmxechxoqcimgvwmdvgn). For a new project: paste into SQL Editor → Run.
-- Safe to run once on a new project.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  platform text not null check (platform in ('android','ios','web')),
  is_sharing_device boolean not null default false,
  battery real check (battery between 0 and 1),
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  accuracy_m real,
  located_at timestamptz,
  lost boolean not null default false,
  lost_message text,
  lost_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index devices_user_idx on public.devices (user_id);
-- only one device per person shares their location with others
create unique index devices_one_sharing_idx on public.devices (user_id) where is_sharing_device;

-- owner = the person whose location is shared; viewer = who sees it.
-- requested_by = who started it. The OTHER person must accept.
create table public.shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','declined')),
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint not_self check (owner_id <> viewer_id),
  constraint requester_is_party check (requested_by in (owner_id, viewer_id)),
  constraint one_per_direction unique (owner_id, viewer_id)
);
create index shares_viewer_idx on public.shares (viewer_id);

create table public.geofences (
  id uuid primary key default gen_random_uuid(),
  watcher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m real not null default 150 check (radius_m between 50 and 5000),
  trigger text not null check (trigger in ('arrive','leave')),
  repeat boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geofence_not_self check (watcher_id <> subject_id)
);
create index geofences_subject_idx on public.geofences (subject_id) where active;
create index geofences_watcher_idx on public.geofences (watcher_id);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid references public.profiles(id) on delete cascade,
  geofence_id uuid references public.geofences(id) on delete set null,
  kind text not null check (kind in ('arrived','left','share_request','share_accepted','geofence_set','device_found')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index alerts_recipient_idx on public.alerts (recipient_id, created_at desc);

create table public.commands (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('play_sound','lost_on','lost_off')),
  status text not null default 'pending' check (status in ('pending','done')),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index commands_pending_idx on public.commands (device_id) where status = 'pending';

-- ---------- helpers ----------

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger devices_touch before update on public.devices for each row execute function public.touch_updated_at();
create trigger shares_touch before update on public.shares for each row execute function public.touch_updated_at();
create trigger geofences_touch before update on public.geofences for each row execute function public.touch_updated_at();

-- distance in metres (haversine)
create or replace function public.distance_m(lat1 double precision, lng1 double precision,
                                             lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- can the current user see owner's location right now?
create or replace function public.can_view(owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shares s
    where s.owner_id = owner and s.viewer_id = auth.uid()
      and s.status = 'active' and (s.expires_at is null or s.expires_at > now()))
$$;

-- does the current user have any share relation with this person?
create or replace function public.is_connected(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shares s
    where (s.owner_id = other and s.viewer_id = auth.uid())
       or (s.viewer_id = other and s.owner_id = auth.uid()))
$$;

-- create a profile for every new sign-up
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, lower(new.email), split_part(coalesce(new.email, ''), '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- sharing functions (the only way to create/accept shares) ----------

-- direction 'share' = I share MY location with them; 'request' = I ask to see THEIRS.
create or replace function public.create_share(target_email text, direction text, expires timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  them uuid;
  new_id uuid;
  my_name text;
begin
  if me is null then raise exception 'not signed in'; end if;
  if direction not in ('share','request') then raise exception 'bad direction'; end if;
  if expires is not null and expires <= now() then raise exception 'expiry must be in the future'; end if;
  select id into them from public.profiles where email = lower(trim(target_email));
  if them is null then raise exception 'No account with that email yet. Ask them to install the app and sign up first.'; end if;
  if them = me then raise exception 'You cannot share with yourself'; end if;
  select coalesce(nullif(display_name, ''), email) into my_name from public.profiles where id = me;

  insert into public.shares (owner_id, viewer_id, requested_by, status, expires_at)
  values (case when direction = 'share' then me else them end,
          case when direction = 'share' then them else me end,
          me, 'pending', expires)
  on conflict (owner_id, viewer_id) do update
    set requested_by = excluded.requested_by, status = 'pending',
        expires_at = excluded.expires_at, accepted_at = null
  returning id into new_id;

  insert into public.alerts (recipient_id, subject_id, kind, body)
  values (them, me, 'share_request',
          case when direction = 'share' then my_name || ' wants to share their location with you'
               else my_name || ' is asking to see your location' end);
  return new_id;
end $$;

-- only the person who did NOT start the request can accept it
create or replace function public.respond_share(share_id uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shares; me uuid := auth.uid(); my_name text;
begin
  select * into s from public.shares where id = share_id for update;
  if s.id is null or me not in (s.owner_id, s.viewer_id) then raise exception 'not found'; end if;
  if s.requested_by = me then raise exception 'waiting for the other person to respond'; end if;
  if s.status <> 'pending' then raise exception 'already answered'; end if;
  update public.shares set status = case when accept then 'active' else 'declined' end,
                           accepted_at = case when accept then now() end
   where id = share_id;
  if accept then
    select coalesce(nullif(display_name, ''), email) into my_name from public.profiles where id = me;
    insert into public.alerts (recipient_id, subject_id, kind, body)
    values (s.requested_by, me, 'share_accepted', my_name || ' accepted your location sharing');
  end if;
end $$;

-- either person can end a share at any time
create or replace function public.end_share(share_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- geofences tied to this share are removed by the shares_cleanup trigger
  delete from public.shares where id = share_id and auth.uid() in (owner_id, viewer_id);
end $$;

create or replace function public.cleanup_after_share() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.geofences where watcher_id = old.viewer_id and subject_id = old.owner_id;
  return old;
end $$;
create trigger shares_cleanup after delete on public.shares
  for each row execute function public.cleanup_after_share();

-- ---------- location reporting + geofence alerts ----------

create or replace function public.report_location(p_device uuid, p_lat double precision, p_lng double precision,
                                                  p_accuracy real, p_battery real)
returns setof public.commands language plpgsql security invoker set search_path = public as $$
begin
  update public.devices
     set lat = p_lat, lng = p_lng, accuracy_m = p_accuracy, battery = p_battery, located_at = now()
   where id = p_device and user_id = auth.uid();
  if not found then raise exception 'device not found'; end if;
  return query select * from public.commands
    where device_id = p_device and status = 'pending' order by created_at;
end $$;

create or replace function public.check_geofences() returns trigger
language plpgsql security definer set search_path = public as $$
declare g record; was_in boolean; now_in boolean; subj text;
begin
  if not new.is_sharing_device or new.lat is null then return new; end if;
  if old.lat is not null and old.lat = new.lat and old.lng = new.lng then return new; end if;
  select coalesce(nullif(display_name, ''), email) into subj from public.profiles where id = new.user_id;
  for g in select * from public.geofences where subject_id = new.user_id and active loop
    -- watcher must still be allowed to see this person
    if not exists (select 1 from public.shares s where s.owner_id = new.user_id and s.viewer_id = g.watcher_id
                   and s.status = 'active' and (s.expires_at is null or s.expires_at > now())) then
      continue;
    end if;
    now_in := public.distance_m(g.lat, g.lng, new.lat, new.lng) <= g.radius_m;
    if old.lat is null then continue; end if;           -- first fix: no transition yet
    was_in := public.distance_m(g.lat, g.lng, old.lat, old.lng) <= g.radius_m;
    if (g.trigger = 'arrive' and not was_in and now_in) or (g.trigger = 'leave' and was_in and not now_in) then
      insert into public.alerts (recipient_id, subject_id, geofence_id, kind, body)
      values (g.watcher_id, new.user_id, g.id,
              case when g.trigger = 'arrive' then 'arrived' else 'left' end,
              subj || case when g.trigger = 'arrive' then ' arrived at ' else ' left ' end || g.name);
      if not g.repeat then update public.geofences set active = false where id = g.id; end if;
    end if;
  end loop;
  return new;
end $$;
create trigger devices_geofence after update of lat, lng on public.devices
  for each row execute function public.check_geofences();

-- tell the subject whenever someone sets an alert on them (consent)
create or replace function public.notify_geofence_subject() returns trigger
language plpgsql security definer set search_path = public as $$
declare w text;
begin
  select coalesce(nullif(display_name, ''), email) into w from public.profiles where id = new.watcher_id;
  insert into public.alerts (recipient_id, subject_id, geofence_id, kind, body)
  values (new.subject_id, new.watcher_id, new.id, 'geofence_set',
          w || ' will be notified when you ' || case when new.trigger = 'arrive' then 'arrive at ' else 'leave ' end || new.name);
  return new;
end $$;
create trigger geofences_notify after insert on public.geofences
  for each row execute function public.notify_geofence_subject();

-- lost mode flag follows commands, and "found" alert when a lost device reports again
create or replace function public.apply_command() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'lost_on' then update public.devices set lost = true where id = new.device_id;
  elsif new.kind = 'lost_off' then update public.devices set lost = false where id = new.device_id;
  end if;
  return new;
end $$;
create trigger commands_apply after insert on public.commands
  for each row execute function public.apply_command();

create or replace function public.notify_found() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lost and new.located_at is not null
     and (old.located_at is null or new.located_at - old.located_at > interval '30 minutes') then
    insert into public.alerts (recipient_id, kind, body)
    values (new.user_id, 'device_found', new.name || ' was just located');
  end if;
  return new;
end $$;
create trigger devices_found after update of located_at on public.devices
  for each row execute function public.notify_found();

-- delete your own account and everything tied to it (required by Apple and Google)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- row level security ----------

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.shares enable row level security;
alter table public.geofences enable row level security;
alter table public.alerts enable row level security;
alter table public.commands enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_connected(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy devices_read on public.devices for select to authenticated
  using (user_id = auth.uid() or (is_sharing_device and public.can_view(user_id)));
create policy devices_insert on public.devices for insert to authenticated
  with check (user_id = auth.uid());
create policy devices_update on public.devices for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy devices_delete on public.devices for delete to authenticated
  using (user_id = auth.uid());

create policy shares_read on public.shares for select to authenticated
  using (auth.uid() in (owner_id, viewer_id));
create policy shares_delete on public.shares for delete to authenticated
  using (auth.uid() in (owner_id, viewer_id));
-- no insert/update policy: only create_share / respond_share can do that

create policy geofences_read on public.geofences for select to authenticated
  using (auth.uid() in (watcher_id, subject_id));
create policy geofences_insert on public.geofences for insert to authenticated
  with check (watcher_id = auth.uid() and public.can_view(subject_id));
create policy geofences_delete on public.geofences for delete to authenticated
  using (auth.uid() in (watcher_id, subject_id));

create policy alerts_read on public.alerts for select to authenticated
  using (recipient_id = auth.uid());
create policy alerts_update on public.alerts for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy alerts_delete on public.alerts for delete to authenticated
  using (recipient_id = auth.uid());

create policy commands_read on public.commands for select to authenticated
  using (user_id = auth.uid());
create policy commands_insert on public.commands for insert to authenticated
  with check (user_id = auth.uid()
              and exists (select 1 from public.devices d where d.id = device_id and d.user_id = auth.uid()));
create policy commands_update on public.commands for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update on public.shares from authenticated;
grant execute on function public.create_share(text, text, timestamptz),
                         public.respond_share(uuid, boolean),
                         public.end_share(uuid),
                         public.delete_my_account(),
                         public.report_location(uuid, double precision, double precision, real, real)
  to authenticated;

-- ---------- realtime ----------
alter publication supabase_realtime add table public.devices, public.shares, public.alerts, public.commands;

-- ---------- lock down internal functions ----------
revoke all on all tables in schema public from anon;
revoke execute on function public.create_share(text, text, timestamptz), public.respond_share(uuid, boolean),
  public.end_share(uuid), public.delete_my_account(),
  public.report_location(uuid, double precision, double precision, real, real) from anon, public;
revoke execute on function public.apply_command(), public.check_geofences(), public.cleanup_after_share(),
  public.handle_new_user(), public.notify_found(), public.notify_geofence_subject(),
  public.touch_updated_at()
  from public, anon, authenticated;
revoke execute on function public.can_view(uuid), public.is_connected(uuid) from public, anon;
grant execute on function public.can_view(uuid), public.is_connected(uuid) to authenticated;
