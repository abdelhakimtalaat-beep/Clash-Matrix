import { z } from 'zod';
import { handle, json, ok } from '@/lib/api';
import { ApiError, requireUser } from '@/lib/auth';
import { audit, one, q } from '@/lib/db';
import { assertScope } from '@/lib/perm';
import { NODE_KEYS, PROCESS_STATUSES, nodeById } from '@/lib/processMap';

/** Sets the status of several activities (a whole phase) of one building in one go. Existing comments are kept. Administrator or the assigned BIM Manager / Coordinator. */
export async function PUT(req: Request) {
  return handle(async () => {
    const me = await requireUser();
    const b = z.object({
      building_id: z.string().uuid(),
      items: z.array(z.object({ node_key: z.string().refine((k) => NODE_KEYS.has(k), 'Unknown node'), status: z.enum(PROCESS_STATUSES) })).min(1).max(200),
      apply_all: z.boolean().optional(),
    }).parse(await json(req));
    const bl = await one<any>('select b.project_id,c.name,p.name pname from process_buildings b join project_contents c on c.id=b.content_id join projects p on p.id=b.project_id where b.id=$1', [b.building_id]);
    if (!bl) throw new ApiError(404, 'Building not found on the process map');
    await assertScope(me, bl.project_id, 'manager');
    const who = me.full_name || me.email;
    const items: { node_key: string; status: (typeof PROCESS_STATUSES)[number] }[] = [];
    for (const i of b.items as { node_key: string; status: (typeof PROCESS_STATUSES)[number] }[]) if (!items.some((x) => x.node_key === i.node_key)) items.push(i);
    let changed = 0;
    for (const it of items) {
      const before = await one<any>('select status,comment from process_nodes where building_id=$1 and node_key=$2', [b.building_id, it.node_key]);
      if ((before?.status ?? 'Not Started') !== it.status) changed++;
      if (it.status === 'Not Started' && !before?.comment) await q('delete from process_nodes where building_id=$1 and node_key=$2', [b.building_id, it.node_key]);
      else await q(`insert into process_nodes(building_id,node_key,status,comment,updated_by,updated_at) values($1,$2,$3,null,$4,now())
        on conflict (building_id,node_key) do update set status=excluded.status, updated_by=excluded.updated_by, updated_at=now()`, [b.building_id, it.node_key, it.status, who]);
      if (b.apply_all) {
        await q(`insert into process_nodes(building_id,node_key,status,comment,updated_by,updated_at) select id,$2,$3,null,$4,now() from process_buildings where project_id=$1 and id<>$5
          on conflict (building_id,node_key) do update set status=excluded.status, updated_by=excluded.updated_by, updated_at=now()`, [bl.project_id, it.node_key, it.status, who, b.building_id]);
        if (it.status === 'Not Started') await q(`delete from process_nodes where node_key=$2 and status='Not Started' and coalesce(comment,'')='' and building_id in (select id from process_buildings where project_id=$1)`, [bl.project_id, it.node_key]);
        await q(`insert into process_project_nodes(project_id,node_key,status,updated_by,updated_at) values($1,$2,$3,$4,now())
          on conflict (project_id,node_key) do update set status=excluded.status, updated_by=excluded.updated_by, updated_at=now()`, [bl.project_id, it.node_key, it.status, who]);
      } else if (b.apply_all === false) await q('delete from process_project_nodes where project_id=$1 and node_key=$2', [bl.project_id, it.node_key]);
    }
    await audit(null, me.email, 'status', 'process_node', b.building_id, `${bl.pname} / ${bl.name}: bulk update of ${items.length} activities (${changed} changed): ${items.map((i) => `"${nodeById.get(i.node_key)!.label}" → ${i.status}`).join('; ').slice(0, 1500)}${b.apply_all ? ' (linked: applied to all buildings)' : ''}`);
    return ok();
  });
}
