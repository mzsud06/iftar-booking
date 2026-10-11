-- Campus for each night: Guy's, Strand or Waterloo.
alter table public.nights add column campus text check (campus in ('Guy''s', 'Strand', 'Waterloo'));

create or replace function public.admin_set_campus(p_night uuid, p_campus text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_campus is not null and p_campus not in ('Guy''s', 'Strand', 'Waterloo') then
    raise exception 'Campus must be Guy''s, Strand or Waterloo.';
  end if;
  update public.nights set campus = p_campus where id = p_night;
end $$;

revoke execute on function public.admin_set_campus(uuid, text) from anon, public;
grant execute on function public.admin_set_campus(uuid, text) to authenticated;
