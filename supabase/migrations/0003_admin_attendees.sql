-- Admin view of a night's bookings, including who checked each person in.
create or replace function public.admin_night_attendees(p_night uuid)
returns table (
  booking_id uuid, full_name text, email text, side text, short_code text, status text,
  checked_in_at timestamptz, checked_in_by_name text, is_comp boolean, late_cancel boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
    select b.id, coalesce(p.full_name, b.guest_name), p.email, b.side, b.short_code, b.status,
           b.checked_in_at, v.full_name, b.is_comp, b.late_cancel
    from public.bookings b
    left join public.profiles p on p.id = b.user_id
    left join public.profiles v on v.id = b.checked_in_by
    where b.night_id = p_night
    order by coalesce(p.full_name, b.guest_name);
end $$;

revoke execute on function public.admin_night_attendees(uuid) from anon, public;
grant execute on function public.admin_night_attendees(uuid) to authenticated;
