\set ON_ERROR_STOP on
-- helper: act as a user
create or replace function pg_temp.act(u uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false);
end $$;

insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-00000000000a','alice@x.com'),('00000000-0000-0000-0000-00000000000b','bob@x.com'),
 ('00000000-0000-0000-0000-00000000000c','carol@x.com'),('00000000-0000-0000-0000-00000000000d','dave@x.com');

do $t$
declare
  alice uuid := '00000000-0000-0000-0000-00000000000a'; bob uuid := '00000000-0000-0000-0000-00000000000b';
  carol uuid := '00000000-0000-0000-0000-00000000000c'; dave uuid := '00000000-0000-0000-0000-00000000000d';
  pid uuid; v int; n int; msg text; code text;
begin
  assert (select count(*) from public.profiles) = 4, 'profiles created by trigger';

  -- Alice creates a project and becomes admin
  perform set_config('request.jwt.claim.sub', alice::text, true); set local role authenticated;
  pid := public.create_project('P1');
  assert public.role_in(pid) = 'admin', 'creator is admin';
  perform public.add_member_by_email(pid, 'BOB@x.com', 'editor');
  perform public.add_member_by_email(pid, 'carol@x.com', 'viewer');
  begin perform public.add_member_by_email(pid, 'nobody@x.com', 'viewer'); assert false, 'should fail';
  exception when sqlstate 'P0002' then null; end;
  reset role;

  -- outsider sees nothing and cannot write
  perform set_config('request.jwt.claim.sub', dave::text, true); set local role authenticated;
  assert (select count(*) from public.projects) = 0, 'outsider sees no project';
  assert (select count(*) from public.entities) = 0, 'outsider sees no entities';
  begin perform public.save_entity(pid,'clashTest','t1','{"name":"x"}',0); assert false, 'outsider write';
  exception when sqlstate '42501' then null; end;
  reset role;

  -- optimistic concurrency between two editors
  perform set_config('request.jwt.claim.sub', bob::text, true); set local role authenticated;
  v := public.save_entity(pid,'clashTest','t1','{"name":"by bob"}',0);
  assert v = 1, 'first save is v1';
  reset role;
  perform set_config('request.jwt.claim.sub', alice::text, true); set local role authenticated;
  v := public.save_entity(pid,'clashTest','t1','{"name":"by alice"}',1);
  assert v = 2, 'second save is v2';
  reset role;
  perform set_config('request.jwt.claim.sub', bob::text, true); set local role authenticated;
  begin perform public.save_entity(pid,'clashTest','t1','{"name":"stale bob"}',1); assert false, 'stale write must conflict';
  exception when sqlstate '40001' then null; end;
  begin perform public.save_entity(pid,'clashTest','t1','{"name":"dup create"}',0); assert false, 'create over existing must conflict';
  exception when sqlstate '40001' then null; end;
  assert (select data->>'name' from public.entities where id='t1') = 'by alice', 'stale write did not apply';
  reset role;

  -- viewer cannot write by any route
  perform set_config('request.jwt.claim.sub', carol::text, true); set local role authenticated;
  assert (select count(*) from public.entities) = 1, 'viewer can read';
  begin perform public.save_entity(pid,'clashTest','t1','{"name":"viewer"}',2); assert false, 'viewer rpc';
  exception when sqlstate '42501' then null; end;
  update public.entities set data='{"name":"hack"}' where id='t1'; get diagnostics n = row_count;
  assert n = 0, 'viewer direct update affects nothing';
  begin insert into public.entities(project_id,kind,id,data) values (pid,'clashTest','t9','{}'); assert false, 'viewer insert';
  exception when sqlstate '42501' then null; end;
  begin insert into public.snapshots(project_id,label,data) values (pid,'s','{}'); assert false, 'viewer snapshot';
  exception when sqlstate '42501' then null; end;
  begin perform public.add_member_by_email(pid,'dave@x.com','editor'); assert false, 'viewer cannot add';
  exception when sqlstate '42501' then null; end;
  assert (select count(*) from public.profiles) = 3, 'viewer sees co-member profiles only (not dave)';
  reset role;

  perform set_config('request.jwt.claim.sub', dave::text, true); set local role authenticated;
  assert (select count(*) from public.entities) = 0, 'outsider still sees no entities after data exists';
  assert (select count(*) from public.audit_log) = 0, 'outsider sees no audit';
  assert (select count(*) from public.project_members) = 0, 'outsider sees no members';
  reset role;

  -- soft delete + restore are audited with the right action
  perform set_config('request.jwt.claim.sub', bob::text, true); set local role authenticated;
  v := public.save_entity(pid,'clashTest','t1','{"name":"by alice"}',2,true);
  v := public.save_entity(pid,'clashTest','t1','{"name":"back"}',v,false);
  insert into public.snapshots(project_id,label,data) values (pid,'v1','{"a":1}');
  reset role;
  perform set_config('request.jwt.claim.sub', alice::text, true); set local role authenticated;
  assert (select string_agg(action, ',' order by id) from public.audit_log where project_id=pid) = 'insert,update,delete,restore', 'audit actions';
  assert (select by_user from public.audit_log where action='insert') = bob, 'audit records the actor';
  assert (select count(*) from public.snapshots) = 1, 'snapshot saved';
  -- audit is not writable by clients
  begin insert into public.audit_log(project_id,action,kind,entity_id) values (pid,'x','x','x'); assert false, 'audit insert';
  exception when sqlstate '42501' then null; end;

  -- last-admin protection
  begin perform public.set_member_role(pid, alice, 'editor'); assert false, 'demote last admin';
  exception when sqlstate 'P0001' then null; end;
  begin perform public.remove_member(pid, alice); assert false, 'remove last admin';
  exception when sqlstate 'P0001' then null; end;
  perform public.set_member_role(pid, carol, 'editor');
  assert public.role_in(pid) = 'admin';
  reset role;
  perform set_config('request.jwt.claim.sub', carol::text, true); set local role authenticated;
  v := public.save_entity(pid,'profile','p1','{"id":"p1"}',0);   -- promoted viewer can now write
  reset role;
  raise notice 'ALL SQL TESTS PASSED';
end $t$;
