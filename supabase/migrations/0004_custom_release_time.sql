-- Set a night's booking release time in London time (e.g. night 1, after the moon sighting).
create or replace function public.admin_set_opens(p_night uuid, p_date date, p_time text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_opens timestamptz := (p_date::timestamp + p_time::time) at time zone 'Europe/London';
  n public.nights;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into n from public.nights where id = p_night;
  if n.id is null or n.status <> 'scheduled' then raise exception 'Only upcoming nights can be changed.'; end if;
  if v_opens >= n.iftar_at - interval '3 hours' then
    raise exception 'Booking must open more than 3 hours before iftar.';
  end if;
  update public.nights set booking_opens_at = v_opens where id = p_night;
  insert into public.audit_log(actor, night_id, action, detail)
    values (auth.uid(), p_night, 'release_time_changed', to_char(v_opens at time zone 'Europe/London', 'Dy DD Mon HH24:MI'));
end $$;

revoke execute on function public.admin_set_opens(uuid, date, text) from anon, public;
grant execute on function public.admin_set_opens(uuid, date, text) to authenticated;
