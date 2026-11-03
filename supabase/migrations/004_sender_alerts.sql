-- Let the person being located set "tell X when I arrive/leave" themselves.

alter table public.geofences add column if not exists created_by uuid references public.profiles(id) on delete cascade;
update public.geofences set created_by = watcher_id where created_by is null;
alter table public.geofences alter column created_by set not null;
alter table public.geofences drop constraint if exists geofence_creator_is_party;
alter table public.geofences add constraint geofence_creator_is_party check (created_by in (watcher_id, subject_id));

drop policy if exists geofences_insert on public.geofences;
create policy geofences_insert on public.geofences for insert to authenticated
  with check (
    created_by = auth.uid() and (
      -- I watch someone who shares with me
      (watcher_id = auth.uid() and public.can_view(subject_id))
      or
      -- I tell someone (who can already see me) about my own arrivals
      (subject_id = auth.uid() and exists (
        select 1 from public.shares s
        where s.owner_id = auth.uid() and s.viewer_id = watcher_id
          and s.status = 'active' and (s.expires_at is null or s.expires_at > now())))
    ));

-- whoever did NOT set the alert is told about it
create or replace function public.notify_geofence_subject() returns trigger
language plpgsql security definer set search_path = public as $$
declare w text; subj text; verb text;
begin
  select coalesce(nullif(display_name, ''), email) into w from public.profiles where id = new.watcher_id;
  select coalesce(nullif(display_name, ''), email) into subj from public.profiles where id = new.subject_id;
  verb := case when new.trigger = 'arrive' then 'arrive at ' else 'leave ' end;
  if new.created_by = new.subject_id then
    insert into public.alerts (recipient_id, subject_id, geofence_id, kind, body)
    values (new.watcher_id, new.subject_id, new.id, 'geofence_set',
            subj || ' will let you know when they ' || verb || new.name);
  else
    insert into public.alerts (recipient_id, subject_id, geofence_id, kind, body)
    values (new.subject_id, new.watcher_id, new.id, 'geofence_set',
            w || ' will be notified when you ' || verb || new.name);
  end if;
  return new;
end $$;
revoke execute on function public.notify_geofence_subject() from public, anon, authenticated;
