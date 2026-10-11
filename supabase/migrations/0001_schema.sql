-- Iftar booking system: tables, security and booking rules.
-- All times are stored as timestamptz; night times are entered in Europe/London.

create extension if not exists pgcrypto;

-------------------------------------------------------------------------------
-- Tables
-------------------------------------------------------------------------------

create table public.admin_emails (
  email text primary key
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  email_key text not null unique,
  full_name text not null check (char_length(full_name) between 2 and 80),
  side text not null check (side in ('brothers','sisters')),
  role text not null default 'attendee' check (role in ('attendee','volunteer','admin')),
  strikes int not null default 0,
  late_cancels int not null default 0,
  bans int not null default 0,
  ban_nights_left int not null default 0,
  ban_applied_at timestamptz,
  ban_source_night uuid,
  created_at timestamptz not null default now()
);

create table public.nights (
  id uuid primary key default gen_random_uuid(),
  night_date date not null unique,
  iftar_at timestamptz not null,
  room text not null default '',
  capacity_brothers int not null default 0 check (capacity_brothers >= 0),
  capacity_sisters int not null default 0 check (capacity_sisters >= 0),
  booking_opens_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','closed')),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  guest_name text,
  side text not null check (side in ('brothers','sisters')),
  status text not null check (status in ('confirmed','waitlisted','offered','cancelled','expired')),
  token uuid not null unique default gen_random_uuid(),
  short_code text not null unique,
  is_comp boolean not null default false,
  from_waitlist boolean not null default false,
  late_cancel boolean not null default false,
  offer_expires_at timestamptz,
  checked_in_at timestamptz,
  checked_in_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or guest_name is not null)
);

create unique index bookings_one_active_per_user
  on public.bookings(night_id, user_id)
  where user_id is not null and status in ('confirmed','waitlisted','offered');
create index bookings_night_side_status on public.bookings(night_id, side, status);
create index bookings_user on public.bookings(user_id);

create table public.walkins (
  id bigserial primary key,
  night_id uuid not null references public.nights(id) on delete cascade,
  side text not null check (side in ('brothers','sisters')),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index walkins_night on public.walkins(night_id, side);

create table public.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  user_id uuid,
  night_id uuid,
  action text not null,
  detail text
);

-------------------------------------------------------------------------------
-- Row level security: reads only. Every change goes through the functions below.
-------------------------------------------------------------------------------

alter table public.admin_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.nights enable row level security;
alter table public.bookings enable row level security;
alter table public.walkins enable row level security;
alter table public.audit_log enable row level security;

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------

create or replace function public.email_key(e text)
returns text language plpgsql immutable set search_path = public as $$
declare
  v_local text;
  v_domain text;
begin
  e := lower(trim(e));
  v_local := split_part(e, '@', 1);
  v_domain := split_part(e, '@', 2);
  v_local := split_part(v_local, '+', 1);
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  end if;
  return v_local || '@' || v_domain;
end $$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('volunteer','admin') from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.gen_short_code()
returns text language plpgsql volatile set search_path = public as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c text;
  i int;
begin
  loop
    c := '';
    for i in 1..6 loop
      c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.bookings where short_code = c);
  end loop;
  return c;
end $$;

create or replace function public.server_time()
returns timestamptz language sql stable as $$ select now() $$;

-- Policies (after helpers exist)
create policy "nights are public" on public.nights for select to anon, authenticated using (true);
create policy "own profile or admin" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy "own bookings or staff" on public.bookings for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy "staff see walkins" on public.walkins for select to authenticated using (public.is_staff());
create policy "admins see audit" on public.audit_log for select to authenticated using (public.is_admin());

-------------------------------------------------------------------------------
-- Internal rule functions (not callable from the website)
-------------------------------------------------------------------------------

-- Offer free spots to the waitlist, oldest first. Offers last 1 hour,
-- or until booking closes (3 hours before iftar), whichever is sooner.
create or replace function public._promote(p_night uuid, p_side text)
returns void language plpgsql security definer set search_path = public as $$
declare
  n public.nights;
  cap int;
  used int;
  nxt uuid;
begin
  select * into n from public.nights where id = p_night for update;
  if n.id is null or n.status <> 'scheduled' or now() >= n.iftar_at - interval '3 hours' then
    return;
  end if;
  cap := case p_side when 'brothers' then n.capacity_brothers else n.capacity_sisters end;
  loop
    select count(*) into used from public.bookings
      where night_id = p_night and side = p_side and status in ('confirmed','offered');
    exit when used >= cap;
    select id into nxt from public.bookings
      where night_id = p_night and side = p_side and status = 'waitlisted'
      order by created_at limit 1;
    exit when nxt is null;
    update public.bookings
      set status = 'offered',
          offer_expires_at = least(now() + interval '1 hour', n.iftar_at - interval '3 hours'),
          updated_at = now()
      where id = nxt;
  end loop;
end $$;

-- Add a strike. Two strikes = a ban: 1 iftar, then 3, then the rest of Ramadan.
-- A ban cancels any upcoming bookings the person already holds.
create or replace function public._add_strike(p_user uuid, p_night uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  len int;
  r record;
begin
  update public.profiles set strikes = strikes + 1 where id = p_user returning * into p;
  if p.id is null then return; end if;
  insert into public.audit_log(actor, user_id, night_id, action, detail)
    values (auth.uid(), p_user, p_night, 'strike', p_reason);

  if p.strikes >= 2 then
    len := case p.bans when 0 then 1 when 1 then 3 else 1000 end;
    update public.profiles
      set bans = bans + 1, ban_nights_left = len, strikes = 0, late_cancels = 0,
          ban_applied_at = now(), ban_source_night = p_night
      where id = p_user;
    insert into public.audit_log(actor, user_id, night_id, action, detail)
      values (auth.uid(), p_user, p_night, 'ban',
              case when len >= 1000 then 'Rest of Ramadan' else len || ' iftar(s)' end);

    for r in
      select b.id, b.night_id, b.side
      from public.bookings b join public.nights n on n.id = b.night_id
      where b.user_id = p_user
        and b.night_id <> p_night
        and b.status in ('confirmed','waitlisted','offered')
        and n.status = 'scheduled'
        and n.iftar_at > now()
    loop
      update public.bookings set status = 'cancelled', updated_at = now() where id = r.id;
      insert into public.audit_log(actor, user_id, night_id, action, detail)
        values (auth.uid(), p_user, r.night_id, 'booking_cancelled_by_ban', null);
      perform public._promote(r.night_id, r.side);
    end loop;
  end if;
end $$;

create or replace function public._close_night(p_night uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  n public.nights;
  r record;
begin
  select * into n from public.nights where id = p_night for update;
  if n.id is null or n.status <> 'scheduled' then return; end if;

  -- 1. Count down existing bans (this night counts unless it caused the ban).
  update public.profiles
    set ban_nights_left = ban_nights_left - 1
    where ban_nights_left > 0
      and ban_source_night is distinct from n.id
      and ban_applied_at < n.iftar_at;

  -- 2. Anyone still waiting didn't get a spot.
  update public.bookings set status = 'expired', updated_at = now()
    where night_id = n.id and status in ('waitlisted','offered');

  -- 3. Strikes for confirmed bookings that were never scanned.
  for r in
    select user_id from public.bookings
    where night_id = n.id and status = 'confirmed' and checked_in_at is null
      and not is_comp and user_id is not null
  loop
    perform public._add_strike(r.user_id, n.id, 'Missed the iftar on ' || to_char(n.night_date, 'FMDD Mon'));
  end loop;

  update public.nights set status = 'closed', closed_at = now() where id = n.id;
  insert into public.audit_log(actor, night_id, action) values (auth.uid(), n.id, 'night_closed');
end $$;

create or replace function public.expire_offers()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    update public.bookings set status = 'expired', updated_at = now()
    where status = 'offered' and offer_expires_at <= now()
    returning night_id, side
  loop
    perform public._promote(r.night_id, r.side);
  end loop;
end $$;

-- Nights close themselves at 03:00 the next morning if no admin closed them.
create or replace function public.auto_close_nights()
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select id from public.nights
    where status = 'scheduled'
      and now() >= ((night_date + 1)::timestamp + time '03:00') at time zone 'Europe/London'
  loop
    perform public._close_night(r.id);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Attendee functions
-------------------------------------------------------------------------------

create or replace function public.create_profile(p_full_name text, p_side text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_role text := 'attendee';
  r public.profiles;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Your account is already set up.';
  end if;
  if p_side not in ('brothers','sisters') then raise exception 'Please choose brothers or sisters.'; end if;
  select email into v_email from auth.users where id = auth.uid();
  if exists (select 1 from public.admin_emails a where public.email_key(a.email) = public.email_key(v_email)) then
    v_role := 'admin';
  end if;
  begin
    insert into public.profiles(id, email, email_key, full_name, side, role)
      values (auth.uid(), v_email, public.email_key(v_email), trim(p_full_name), p_side, v_role)
      returning * into r;
  exception when unique_violation then
    raise exception 'An account with this email address already exists.';
  end;
  return r;
end $$;

create or replace function public.update_my_name(p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set full_name = trim(p_full_name) where id = auth.uid();
end $$;

create or replace function public.book_night(p_night uuid)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  p public.profiles;
  n public.nights;
  cap int;
  used int;
  v_status text;
  b public.bookings;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Please finish setting up your account first.'; end if;
  if p.ban_nights_left > 0 then
    if p.ban_nights_left >= 1000 then
      raise exception 'You can''t book any more iftars this Ramadan because of missed bookings. Contact the ISoc if you think this is a mistake.';
    end if;
    raise exception 'You can''t book right now because of missed iftars. You can book again after % more iftar night(s).', p.ban_nights_left;
  end if;

  select * into n from public.nights where id = p_night for update;
  if n.id is null or n.status <> 'scheduled' then raise exception 'This iftar isn''t open for booking.'; end if;
  if now() < n.booking_opens_at then raise exception 'Booking for this iftar hasn''t opened yet.'; end if;
  if now() >= n.iftar_at - interval '3 hours' then
    raise exception 'Booking for this iftar has closed. You can still come as a walk-in at iftar time.';
  end if;
  if exists (select 1 from public.bookings where night_id = p_night and user_id = p.id
             and status in ('confirmed','waitlisted','offered')) then
    raise exception 'You already have a booking for this iftar.';
  end if;

  cap := case p.side when 'brothers' then n.capacity_brothers else n.capacity_sisters end;
  select count(*) into used from public.bookings
    where night_id = p_night and side = p.side and status in ('confirmed','offered');

  if used < cap and not exists (select 1 from public.bookings
        where night_id = p_night and side = p.side and status = 'waitlisted') then
    v_status := 'confirmed';
  else
    v_status := 'waitlisted';
  end if;

  insert into public.bookings(night_id, user_id, side, status, short_code)
    values (p_night, p.id, p.side, v_status, public.gen_short_code())
    returning * into b;
  return b;
end $$;

create or replace function public.cancel_booking(p_booking uuid)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  n public.nights;
  p public.profiles;
  late boolean := false;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.user_id is distinct from auth.uid() then raise exception 'Booking not found.'; end if;
  select * into n from public.nights where id = b.night_id for update;
  select * into b from public.bookings where id = p_booking for update;
  if b.status not in ('confirmed','waitlisted','offered') then raise exception 'This booking is already cancelled.'; end if;
  if b.status = 'confirmed' and now() >= n.iftar_at then
    raise exception 'It''s past iftar time, so this booking can''t be cancelled now.';
  end if;
  if b.status = 'confirmed' and not b.from_waitlist and now() >= n.iftar_at - interval '3 hours' then
    late := true;
  end if;

  update public.bookings set status = 'cancelled', late_cancel = late, updated_at = now()
    where id = b.id returning * into b;

  if late then
    update public.profiles set late_cancels = late_cancels + 1 where id = b.user_id returning * into p;
    if p.late_cancels % 3 = 0 then
      perform public._add_strike(p.id, n.id, 'Third late cancel');
    end if;
  end if;

  perform public._promote(n.id, b.side);
  return b;
end $$;

create or replace function public.confirm_offer(p_booking uuid)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
  n public.nights;
begin
  select * into b from public.bookings where id = p_booking;
  if b.id is null or b.user_id is distinct from auth.uid() then raise exception 'Booking not found.'; end if;
  select * into n from public.nights where id = b.night_id for update;
  select * into b from public.bookings where id = p_booking for update;
  if b.status <> 'offered' then raise exception 'There''s no spot waiting for you on this booking.'; end if;
  if now() >= b.offer_expires_at then
    update public.bookings set status = 'expired', updated_at = now() where id = b.id;
    perform public._promote(n.id, b.side);
    raise exception 'Sorry, this offer has expired and the spot has moved to the next person.';
  end if;
  update public.bookings set status = 'confirmed', from_waitlist = true, offer_expires_at = null, updated_at = now()
    where id = b.id returning * into b;
  return b;
end $$;

-- The signed-in person's bookings for nights that haven't closed, with waitlist position.
create or replace function public.my_bookings()
returns table (
  booking_id uuid, night_id uuid, night_date date, iftar_at timestamptz, room text,
  night_status text, status text, side text, token uuid, short_code text,
  offer_expires_at timestamptz, checked_in_at timestamptz, from_waitlist boolean,
  waitlist_position int
) language plpgsql security definer set search_path = public as $$
begin
  perform public.expire_offers();
  return query
    select b.id, n.id, n.night_date, n.iftar_at, n.room, n.status, b.status, b.side, b.token, b.short_code,
           b.offer_expires_at, b.checked_in_at, b.from_waitlist,
           case when b.status = 'waitlisted' then
             (select count(*)::int + 1 from public.bookings w
              where w.night_id = b.night_id and w.side = b.side and w.status = 'waitlisted' and w.created_at < b.created_at)
           end
    from public.bookings b join public.nights n on n.id = b.night_id
    where b.user_id = auth.uid()
      and b.status in ('confirmed','waitlisted','offered')
      and n.status = 'scheduled'
    order by n.night_date;
end $$;

-- Public, no personal data: spots per side for a night.
create or replace function public.night_counts(p_night uuid)
returns table (
  side text, capacity int, booked int, waitlisted int, checked_in int, walkins int, spots_left int
) language plpgsql stable security definer set search_path = public as $$
declare
  n public.nights;
begin
  select * into n from public.nights where id = p_night;
  if n.id is null then return; end if;
  return query
    with s(side, cap) as (values ('brothers', n.capacity_brothers), ('sisters', n.capacity_sisters)),
    c as (
      select s.side, s.cap,
        (select count(*)::int from public.bookings b where b.night_id = n.id and b.side = s.side and b.status in ('confirmed','offered')) as booked,
        (select count(*)::int from public.bookings b where b.night_id = n.id and b.side = s.side and b.status = 'waitlisted') as waiting,
        (select count(*)::int from public.bookings b where b.night_id = n.id and b.side = s.side and b.status = 'confirmed' and b.checked_in_at is not null) as scanned,
        (select count(*)::int from public.walkins w where w.night_id = n.id and w.side = s.side and w.removed_at is null) as walk
      from s
    )
    select c.side, c.cap, c.booked, c.waiting, c.scanned, c.walk,
      greatest(0, case when now() < n.iftar_at then c.cap - c.booked - c.walk
                       else c.cap - c.scanned - c.walk end)
    from c;
end $$;

-------------------------------------------------------------------------------
-- Volunteer functions
-------------------------------------------------------------------------------

create or replace function public.check_in(p_night uuid, p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  b public.bookings;
  bn public.nights;
  nm text;
begin
  if not public.is_staff() then raise exception 'Only volunteers can scan tickets.'; end if;
  v_code := trim(coalesce(p_code, ''));
  v_code := regexp_replace(v_code, '^iftar:', '', 'i');

  if v_code ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into b from public.bookings where token = v_code::uuid for update;
  else
    v_code := upper(regexp_replace(v_code, '[^A-Za-z0-9]', '', 'g'));
    select * into b from public.bookings where short_code = v_code for update;
  end if;

  if b.id is null then
    return json_build_object('result', 'not_found');
  end if;

  nm := coalesce((select full_name from public.profiles where id = b.user_id), b.guest_name);
  select * into bn from public.nights where id = b.night_id;

  if b.night_id <> p_night then
    return json_build_object('result', 'wrong_night', 'name', nm, 'side', b.side,
                             'night_date', bn.night_date);
  end if;
  if b.status in ('cancelled','expired') then
    return json_build_object('result', 'cancelled', 'name', nm, 'side', b.side);
  end if;
  if b.status in ('waitlisted','offered') then
    return json_build_object('result', 'not_confirmed', 'name', nm, 'side', b.side);
  end if;
  if b.checked_in_at is not null then
    return json_build_object('result', 'already', 'name', nm, 'side', b.side,
                             'checked_in_at', b.checked_in_at);
  end if;

  update public.bookings set checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
    where id = b.id;
  return json_build_object('result', 'ok', 'name', nm, 'side', b.side, 'is_comp', b.is_comp,
                           'short_code', b.short_code);
end $$;

create or replace function public.add_walkin(p_night uuid, p_side text)
returns int language plpgsql security definer set search_path = public as $$
declare
  n public.nights;
  left_now int;
begin
  if not public.is_staff() then raise exception 'Only volunteers can add walk-ins.'; end if;
  select * into n from public.nights where id = p_night for update;
  if n.id is null or n.status <> 'scheduled' then raise exception 'This night isn''t running.'; end if;
  select c.spots_left into left_now from public.night_counts(p_night) c where c.side = p_side;
  if coalesce(left_now, 0) <= 0 then raise exception 'No spots left for walk-ins on this side.'; end if;
  insert into public.walkins(night_id, side, added_by) values (p_night, p_side, auth.uid());
  return left_now - 1;
end $$;

create or replace function public.remove_walkin(p_night uuid, p_side text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only volunteers can change walk-ins.'; end if;
  update public.walkins set removed_at = now() where id = (
    select id from public.walkins
    where night_id = p_night and side = p_side and removed_at is null
    order by created_at desc limit 1);
end $$;

create or replace function public.search_attendees(p_night uuid, p_query text)
returns table (
  booking_id uuid, full_name text, email text, side text, short_code text,
  status text, checked_in_at timestamptz, is_comp boolean
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only volunteers can search.'; end if;
  return query
    select b.id, coalesce(p.full_name, b.guest_name),
           case when public.is_admin() then p.email else null end,
           b.side, b.short_code, b.status, b.checked_in_at, b.is_comp
    from public.bookings b left join public.profiles p on p.id = b.user_id
    where b.night_id = p_night
      and b.status in ('confirmed','waitlisted','offered')
      and (coalesce(p_query, '') = ''
           or coalesce(p.full_name, b.guest_name) ilike '%' || p_query || '%'
           or b.short_code ilike '%' || regexp_replace(p_query, '[^A-Za-z0-9]', '', 'g') || '%'
           or (public.is_admin() and p.email ilike '%' || p_query || '%'))
    order by coalesce(p.full_name, b.guest_name)
    limit 200;
end $$;

-------------------------------------------------------------------------------
-- Admin functions
-------------------------------------------------------------------------------

create or replace function public.admin_save_night(
  p_id uuid, p_date date, p_iftar_time text, p_room text,
  p_capacity_brothers int, p_capacity_sisters int, p_opens_at timestamptz default null
) returns public.nights language plpgsql security definer set search_path = public as $$
declare
  v_iftar timestamptz;
  v_opens timestamptz;
  r public.nights;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  v_iftar := (p_date::timestamp + p_iftar_time::time) at time zone 'Europe/London';
  v_opens := coalesce(p_opens_at, ((p_date - 1)::timestamp + time '06:00') at time zone 'Europe/London');
  if p_id is null then
    insert into public.nights(night_date, iftar_at, room, capacity_brothers, capacity_sisters, booking_opens_at)
      values (p_date, v_iftar, coalesce(p_room, ''), p_capacity_brothers, p_capacity_sisters, v_opens)
      returning * into r;
    insert into public.audit_log(actor, night_id, action) values (auth.uid(), r.id, 'night_created');
  else
    update public.nights
      set night_date = p_date, iftar_at = v_iftar, room = coalesce(p_room, ''),
          capacity_brothers = p_capacity_brothers, capacity_sisters = p_capacity_sisters,
          booking_opens_at = v_opens
      where id = p_id and status = 'scheduled'
      returning * into r;
    if r.id is null then raise exception 'Only upcoming nights can be edited.'; end if;
    insert into public.audit_log(actor, night_id, action) values (auth.uid(), r.id, 'night_edited');
    perform public._promote(r.id, 'brothers');
    perform public._promote(r.id, 'sisters');
  end if;
  return r;
exception when unique_violation then
  raise exception 'There is already a night on that date.';
end $$;

create or replace function public.admin_cancel_night(p_night uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  update public.nights set status = 'cancelled' where id = p_night and status = 'scheduled';
  update public.bookings set status = 'cancelled', updated_at = now()
    where night_id = p_night and status in ('confirmed','waitlisted','offered');
  insert into public.audit_log(actor, night_id, action) values (auth.uid(), p_night, 'night_cancelled');
end $$;

create or replace function public.admin_close_night(p_night uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  n public.nights;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into n from public.nights where id = p_night;
  if n.id is null then raise exception 'Night not found.'; end if;
  if now() < n.iftar_at then raise exception 'You can only close a night after iftar time.'; end if;
  perform public._close_night(p_night);
end $$;

create or replace function public.admin_add_free_ticket(p_night uuid, p_name text, p_side text)
returns public.bookings language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  insert into public.bookings(night_id, guest_name, side, status, short_code, is_comp)
    values (p_night, trim(p_name), p_side, 'confirmed', public.gen_short_code(), true)
    returning * into b;
  insert into public.audit_log(actor, night_id, action, detail) values (auth.uid(), p_night, 'free_ticket', p_name);
  return b;
end $$;

create or replace function public.admin_cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  update public.bookings set status = 'cancelled', updated_at = now()
    where id = p_booking and status in ('confirmed','waitlisted','offered') returning * into b;
  if b.id is not null then
    insert into public.audit_log(actor, user_id, night_id, action) values (auth.uid(), b.user_id, b.night_id, 'admin_cancelled_booking');
    perform public._promote(b.night_id, b.side);
  end if;
end $$;

create or replace function public.admin_undo_check_in(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  update public.bookings set checked_in_at = null, checked_in_by = null, updated_at = now()
    where id = p_booking returning * into b;
  insert into public.audit_log(actor, user_id, night_id, action) values (auth.uid(), b.user_id, b.night_id, 'undo_check_in');
end $$;

create or replace function public.admin_people(p_query text)
returns table (
  id uuid, full_name text, email text, side text, role text, strikes int,
  late_cancels int, bans int, ban_nights_left int, created_at timestamptz
) language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
    select p.id, p.full_name, p.email, p.side, p.role, p.strikes, p.late_cancels, p.bans, p.ban_nights_left, p.created_at
    from public.profiles p
    where coalesce(p_query, '') = '' or p.full_name ilike '%' || p_query || '%' or p.email ilike '%' || p_query || '%'
    order by p.full_name
    limit 200;
end $$;

create or replace function public.admin_update_person(
  p_user uuid, p_role text default null, p_side text default null,
  p_remove_strike boolean default false, p_lift_ban boolean default false
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_role is not null then
    if p_user = auth.uid() and p_role <> 'admin' then raise exception 'You can''t remove your own admin access.'; end if;
    update public.profiles set role = p_role where id = p_user;
    insert into public.audit_log(actor, user_id, action, detail) values (auth.uid(), p_user, 'role_changed', p_role);
  end if;
  if p_side is not null then
    update public.profiles set side = p_side where id = p_user;
    insert into public.audit_log(actor, user_id, action, detail) values (auth.uid(), p_user, 'side_changed', p_side);
  end if;
  if p_remove_strike then
    update public.profiles set strikes = greatest(0, strikes - 1) where id = p_user;
    insert into public.audit_log(actor, user_id, action) values (auth.uid(), p_user, 'strike_removed');
  end if;
  if p_lift_ban then
    update public.profiles set ban_nights_left = 0 where id = p_user;
    insert into public.audit_log(actor, user_id, action) values (auth.uid(), p_user, 'ban_lifted');
  end if;
end $$;

create or replace function public.admin_check_in(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  b public.bookings;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  update public.bookings set checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
    where id = p_booking and status = 'confirmed' and checked_in_at is null returning * into b;
  if b.id is not null then
    insert into public.audit_log(actor, user_id, night_id, action) values (auth.uid(), b.user_id, b.night_id, 'manual_check_in');
  end if;
end $$;

create or replace function public.admin_audit(p_limit int default 100)
returns table (at timestamptz, actor_name text, person_name text, night_date date, action text, detail text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
    select a.at, pa.full_name, pu.full_name, n.night_date, a.action, a.detail
    from public.audit_log a
    left join public.profiles pa on pa.id = a.actor
    left join public.profiles pu on pu.id = a.user_id
    left join public.nights n on n.id = a.night_id
    order by a.at desc
    limit p_limit;
end $$;

-------------------------------------------------------------------------------
-- Permissions
-------------------------------------------------------------------------------

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke select on public.admin_emails, public.audit_log from anon, authenticated;
revoke select on public.profiles, public.bookings, public.walkins from anon;

revoke execute on function public._promote(uuid, text) from public, anon, authenticated;
revoke execute on function public._add_strike(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public._close_night(uuid) from public, anon, authenticated;
revoke execute on function public.expire_offers() from public, anon, authenticated;
revoke execute on function public.auto_close_nights() from public, anon, authenticated;
revoke execute on function public.gen_short_code() from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Timed jobs
-------------------------------------------------------------------------------

create extension if not exists pg_cron;
select cron.schedule('expire-offers', '*/5 * * * *', $$select public.expire_offers()$$);
select cron.schedule('auto-close-nights', '5 * * * *', $$select public.auto_close_nights()$$);

-- First admin. Add more admins from the website's People page.
insert into public.admin_emails(email) values ('masudrahman161106@gmail.com');

-- Only the public counts and server clock are callable without signing in.
revoke execute on all functions in schema public from anon, public;
grant execute on function public.night_counts(uuid) to anon, authenticated;
grant execute on function public.server_time() to anon, authenticated;
grant execute on function public.email_key(text) to authenticated;
alter function public.server_time() set search_path = public;
grant execute on function public.my_role(), public.is_staff(), public.is_admin(),
  public.create_profile(text, text), public.update_my_name(text), public.book_night(uuid),
  public.cancel_booking(uuid), public.confirm_offer(uuid), public.my_bookings(),
  public.check_in(uuid, text), public.add_walkin(uuid, text), public.remove_walkin(uuid, text),
  public.search_attendees(uuid, text),
  public.admin_save_night(uuid, date, text, text, int, int, timestamptz), public.admin_cancel_night(uuid),
  public.admin_close_night(uuid), public.admin_add_free_ticket(uuid, text, text), public.admin_cancel_booking(uuid),
  public.admin_undo_check_in(uuid), public.admin_check_in(uuid), public.admin_people(text),
  public.admin_update_person(uuid, text, text, boolean, boolean), public.admin_audit(int)
  to authenticated;
alter default privileges in schema public revoke execute on functions from anon, public;
