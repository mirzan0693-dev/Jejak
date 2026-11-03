-- Vehicle mode: speed + direction on each location, and each person's car/motorbike choice.

alter table public.devices add column if not exists speed_mps real;
alter table public.devices add column if not exists heading real;

alter table public.profiles add column if not exists active_vehicle text not null default 'car'
  check (active_vehicle in ('car','motorbike'));
alter table public.profiles add column if not exists car_style text not null default 'sedan'
  check (car_style in ('hatchback','sedan','suv','mpv','pickup'));
alter table public.profiles add column if not exists car_color text not null default 'blue'
  check (car_color in ('red','blue','white','black','silver','yellow','green','orange'));
alter table public.profiles add column if not exists bike_style text not null default 'kapcai'
  check (bike_style in ('scooter','kapcai','superbike','cruiser','bicycle'));
alter table public.profiles add column if not exists bike_color text not null default 'red'
  check (bike_color in ('red','blue','white','black','silver','yellow','green','orange'));

drop function if exists public.report_location(uuid, double precision, double precision, real, real);

create or replace function public.report_location(p_device uuid, p_lat double precision, p_lng double precision,
                                                  p_accuracy real, p_battery real,
                                                  p_speed real default null, p_heading real default null)
returns setof public.commands language plpgsql security invoker set search_path = public as $$
declare prev record; secs double precision; spd real := p_speed;
begin
  select lat, lng, located_at into prev from public.devices where id = p_device and user_id = auth.uid();
  if not found then raise exception 'device not found'; end if;
  -- phone gave no speed: work it out from the last fix (only if it was recent)
  if (spd is null or spd < 0) and prev.lat is not null and prev.located_at > now() - interval '10 minutes' then
    secs := extract(epoch from (now() - prev.located_at));
    if secs >= 5 then spd := public.distance_m(prev.lat, prev.lng, p_lat, p_lng) / secs; end if;
  end if;
  if spd is not null and (spd < 0 or spd > 120) then spd := null; end if; -- ignore GPS glitches (>430 km/h)
  update public.devices
     set lat = p_lat, lng = p_lng, accuracy_m = p_accuracy, battery = p_battery, located_at = now(),
         speed_mps = spd, heading = case when p_heading is not null and p_heading >= 0 then p_heading end
   where id = p_device and user_id = auth.uid();
  return query select * from public.commands
    where device_id = p_device and status = 'pending' order by created_at;
end $$;

revoke execute on function public.report_location(uuid, double precision, double precision, real, real, real, real) from public, anon;
grant execute on function public.report_location(uuid, double precision, double precision, real, real, real, real) to authenticated;
