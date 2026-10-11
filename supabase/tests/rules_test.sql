-- Booking rules test. Paste into the Supabase SQL editor and run.
-- It creates fake users and nights, runs every rule, then ROLLS BACK:
-- nothing is saved. The results appear as the error message "TEST RESULTS".
-- Every line should read as expected; anything ending "(bad)" is a failure.
do $$
declare
  out text := '';
  ua uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid(); u5 uuid := gen_random_uuid();
  na uuid; nb uuid; nc uuid; ne uuid; nw uuid;
  b public.bookings; b1 uuid; b2w uuid; b3 uuid; j json; s text; k int; p public.profiles; i int;
  admin_email text := 'rules-test-admin@example.com';
begin
  insert into public.admin_emails(email) values (admin_email);
  insert into auth.users(id, email) values (ua, admin_email),(u1,'t1@gmail.com'),(u2,'t2@test.com'),(u3,'t3@test.com'),(u4,'t4@test.com'),(u5,'t.1+x@googlemail.com');
  perform set_config('request.jwt.claims', json_build_object('sub',ua)::text, true); p := public.create_profile('Test Admin','brothers'); out := out || 'admin role: ' || p.role || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',u1)::text, true); perform public.create_profile('User One','brothers');
  perform set_config('request.jwt.claims', json_build_object('sub',u2)::text, true); perform public.create_profile('User Two','brothers');
  perform set_config('request.jwt.claims', json_build_object('sub',u3)::text, true); perform public.create_profile('User Three','brothers');
  perform set_config('request.jwt.claims', json_build_object('sub',u4)::text, true); perform public.create_profile('User Four','sisters');
  perform set_config('request.jwt.claims', json_build_object('sub',u5)::text, true);
  begin perform public.create_profile('Dup','brothers'); out := out || 'duplicate gmail allowed (bad)' || E'\n';
  exception when others then out := out || 'duplicate gmail blocked' || E'\n'; end;

  insert into public.nights(night_date, iftar_at, capacity_brothers, capacity_sisters, booking_opens_at) values (current_date+400, now()+interval '10 hours', 2, 2, now()-interval '1 hour') returning id into na;
  insert into public.nights(night_date, iftar_at, capacity_brothers, capacity_sisters, booking_opens_at) values (current_date+401, now()+interval '2 hours', 5, 5, now()-interval '20 hours') returning id into nb;
  insert into public.nights(night_date, iftar_at, capacity_brothers, capacity_sisters, booking_opens_at) values (current_date+402, now()-interval '1 hour', 3, 3, now()-interval '30 hours') returning id into nc;
  insert into public.nights(night_date, iftar_at, capacity_brothers, capacity_sisters, booking_opens_at) values (current_date+403, now()-interval '30 minutes', 3, 3, now()-interval '30 hours') returning id into ne;

  perform set_config('request.jwt.claims', json_build_object('sub',u1)::text, true); b := public.book_night(na); b1 := b.id; out := out || 'u1 books: ' || b.status || ' (expect confirmed)' || E'\n';
  begin perform public.book_night(na); out := out || 'double booking allowed (bad)' || E'\n'; exception when others then out := out || 'double booking blocked' || E'\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub',u2)::text, true); b := public.book_night(na); out := out || 'u2 books: ' || b.status || ' (expect confirmed)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',u3)::text, true); b := public.book_night(na); b3 := b.id; out := out || 'u3 books full night: ' || b.status || ' (expect waitlisted)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',u1)::text, true); b := public.cancel_booking(b1); out := out || 'u1 early cancel late=' || b.late_cancel || ' (expect false)' || E'\n';
  select status into s from public.bookings where id = b3; out := out || 'u3 now: ' || s || ' (expect offered)' || E'\n';
  update public.bookings set offer_expires_at = now() - interval '1 minute' where id = b3;
  perform public.expire_offers(); select status into s from public.bookings where id = b3; out := out || 'u3 after offer expires: ' || s || ' (expect expired)' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub',u4)::text, true);
  begin perform public.book_night(nb); out := out || 'booking after close allowed (bad)' || E'\n'; exception when others then out := out || 'booking after close blocked' || E'\n'; end;
  insert into public.bookings(night_id,user_id,side,status,short_code) values (nb,u2,'brothers','confirmed',public.gen_short_code()) returning * into b;
  perform set_config('request.jwt.claims', json_build_object('sub',u2)::text, true); b := public.cancel_booking(b.id); out := out || 'u2 late cancel late=' || b.late_cancel || ' (expect true)' || E'\n';

  insert into public.bookings(night_id,user_id,side,status,short_code) values (nc,u1,'brothers','confirmed','TSTAA1'),(nc,u2,'brothers','confirmed','TSTAA2');
  perform set_config('request.jwt.claims', json_build_object('sub',u1)::text, true);
  begin perform public.check_in(nc,'TSTAA2'); out := out || 'non-volunteer scan allowed (bad)' || E'\n'; exception when others then out := out || 'non-volunteer scan blocked' || E'\n'; end;
  perform set_config('request.jwt.claims', json_build_object('sub',ua)::text, true);
  j := public.check_in(nc,'tst-aa2'); out := out || 'scan: ' || (j->>'result') || ' (expect ok)' || E'\n';
  j := public.check_in(nc,'TSTAA2'); out := out || 'scan again: ' || (j->>'result') || ' (expect already)' || E'\n';
  j := public.check_in(na,'TSTAA1'); out := out || 'scan wrong night: ' || (j->>'result') || ' (expect wrong_night)' || E'\n';
  update public.profiles set strikes = 1 where id = u1;
  perform set_config('request.jwt.claims', json_build_object('sub',u1)::text, true); b := public.book_night(na); out := out || 'u1 rebooks: ' || b.status || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub',ua)::text, true); perform public.admin_close_night(nc);
  select * into p from public.profiles where id = u1; out := out || 'u1 after no-show: bans=' || p.bans || ' blocked=' || p.ban_nights_left || ' (expect 1, 1)' || E'\n';
  select status into s from public.bookings where id = b.id; out := out || 'u1 held booking: ' || s || ' (expect cancelled)' || E'\n';
  select strikes into k from public.profiles where id = u2; out := out || 'u2 scanned strikes=' || k || ' (expect 0)' || E'\n';
  update public.profiles set ban_applied_at = now() - interval '2 hours' where id = u1;
  perform public.admin_close_night(ne); select ban_nights_left into k from public.profiles where id = u1; out := out || 'u1 block after next night=' || k || ' (expect 0)' || E'\n';

  for i in 1..3 loop
    insert into public.nights(night_date, iftar_at, capacity_brothers, capacity_sisters, booking_opens_at) values (current_date+410+i, now()+interval '1 hour', 5, 5, now()-interval '20 hours') returning id into nw;
    insert into public.bookings(night_id,user_id,side,status,short_code) values (nw,u3,'brothers','confirmed',public.gen_short_code()) returning * into b;
    perform set_config('request.jwt.claims', json_build_object('sub',u3)::text, true); perform public.cancel_booking(b.id);
  end loop;
  select strikes into k from public.profiles where id = u3; out := out || 'u3 after 3 late cancels strikes=' || k || ' (expect 1)' || E'\n';

  raise exception E'TEST RESULTS (nothing was saved)\n%', out;
end $$;
