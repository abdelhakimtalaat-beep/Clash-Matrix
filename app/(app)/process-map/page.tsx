'use client';
import { compareByStatusThenManager, managerNames } from '@/lib/projectSort';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowLeft, Minus, Plus, Search, Trash2, Workflow } from 'lucide-react';
import { useApp } from '@/components/store';
import { ProcessDiagram } from '@/components/ProcessDiagram';
import { Confirm, Empty, Field, Modal, PageHeader, Spinner, StatusBadge, useToast } from '@/components/ui';
import { api, fmtDateTime } from '@/lib/client';
import { STATUSES } from '@/lib/types';
import { canEditProject } from '@/lib/can';
import { NODES, PHASES, phaseOf, PROCESS_COLORS, STARTED, alarmsOf, unmetPrereqs, PROCESS_COLOR_NAMES, PROCESS_STATUSES, laneOf, nodeById, progressOf, type NodeState, type ProcessStatus, type StateMap } from '@/lib/processMap';

interface Content { id: string; name: string; kind: string }
interface Building { id: string; content_id: string; name: string; kind: string }
interface Row { building_id: string; node_key: string; status: ProcessStatus; comment: string | null; updated_by: string | null; updated_at: string }
interface Summary { project_id: string; buildings: number; done: number; doing: number; hold: number }

const Legend = () => <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-label="Status colours">{PROCESS_STATUSES.map((s) => <span key={s} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded" style={{ background: PROCESS_COLORS[s] }} />{PROCESS_COLOR_NAMES[s]} — {s}</span>)}</div>;
const Bar = ({ pct }: { pct: number }) => <span className="flex h-2 w-32 overflow-hidden rounded-full bg-slate-200" title={`${pct}% of the activities completed`}><span style={{ width: `${pct}%`, background: PROCESS_COLORS.Completed }} /></span>;

export default function ProcessMapPage() {
  const { me, data } = useApp(); const toast = useToast();
  const [pid, setPid] = useState<string | null>(null);
  const [sum, setSum] = useState<Summary[] | null>(null); const [perB, setPerB] = useState(NODES.length);
  const [q, setQ] = useState(''); const [mine, setMine] = useState(false); const [mgr, setMgr] = useState(''); const [stat, setStat] = useState('');
  const loadSum = useCallback(async () => { try { const r = await api<{ nodes_per_building: number; projects: Summary[] }>('/api/process/summary'); setSum(r.projects); setPerB(r.nodes_per_building); } catch (e: any) { toast(e.message, 'err'); } }, [toast]);
  useEffect(() => { loadSum(); }, [loadSum]);
  const sumBy = useMemo(() => new Map((sum ?? []).map((s) => [s.project_id, s])), [sum]);
  const myIds = useMemo(() => new Set(data.assignments.filter((a) => a.employee_id === me.employee_id && (a.role === 'manager' || a.role === 'coordinator')).map((a) => a.project_id)), [data.assignments, me.employee_id]);
  const mgrsOf = useMemo(() => { const m = new Map<string, string[]>(); for (const a of data.assignments) if (a.role === 'manager') (m.get(a.project_id) ?? m.set(a.project_id, []).get(a.project_id)!).push(a.employee_id); return m; }, [data.assignments]);
  const mgrNameOf = useMemo(() => managerNames(data.assignments, data.employees), [data.assignments, data.employees]);
  const mgrOptions = useMemo(() => { const ids = new Set([...mgrsOf.values()].flat()); return data.employees.filter((e) => ids.has(e.id)).sort((a, b) => a.name.localeCompare(b.name)); }, [mgrsOf, data.employees]);
  const empName = useMemo(() => new Map(data.employees.map((e) => [e.id, e.name])), [data.employees]);
  const list = useMemo(() => { const t = q.trim().toLowerCase(); return data.projects.filter((p) => (!mine || myIds.has(p.id)) && (!stat || p.status === stat) && (!mgr || (mgr === '__none' ? !(mgrsOf.get(p.id)?.length) : !!mgrsOf.get(p.id)?.includes(mgr))) && (!t || p.name.toLowerCase().includes(t) || (p.project_no ?? '').toLowerCase().includes(t))).sort(compareByStatusThenManager(mgrNameOf)); }, [data.projects, q, mine, myIds, mgr, stat, mgrsOf, mgrNameOf]);

  if (pid) return <Dashboard projectId={pid} onBack={() => { setPid(null); loadSum(); }} />;
  return (
    <div className="space-y-4">
      <PageHeader title="BIM Process Map" subtitle="A Design Stage BIM Workflow dashboard exists for every project. Open a project to follow the progress of each of its buildings." />
      <div className="card flex flex-wrap items-end gap-3 p-3">
        <Field label="Search"><div className="relative"><Search size={14} className="absolute left-2.5 top-3 text-slate-400" /><input className="input w-72 pl-8" placeholder="Project name or number…" value={q} onChange={(e) => setQ(e.target.value)} /></div></Field>
        <Field label="BIM Manager"><select className="input w-56" value={mgr} onChange={(e) => setMgr(e.target.value)}><option value="">All BIM Managers</option>{mgrOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}<option value="__none">(No BIM Manager assigned)</option></select></Field>
        <Field label="Status"><select className="input w-44" value={stat} onChange={(e) => setStat(e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        {(mgr || stat || q || mine) && <button className="btn-ghost pb-2 text-sm" onClick={() => { setMgr(''); setStat(''); setQ(''); setMine(false); }}>Clear filters</button>}
        {me.employee_id && <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={mine} onChange={(e) => setMine(e.target.checked)} />My projects only</label>}
        <div className="ml-auto pb-2 text-xs text-slate-500">{list.length} of {data.projects.length} projects</div>
      </div>
      {!sum ? <Spinner /> : !list.length ? <Empty title="No projects match" /> : (
        <div className="card max-h-[calc(100vh-17rem)] overflow-auto"><table className="w-full text-left"><thead><tr>{['Project No.', 'Project name', 'BIM Manager', 'Status', 'Buildings on the map', 'Progress', 'In progress', 'On hold'].map((h) => <th key={h} className="th sticky top-0 z-10">{h}</th>)}</tr></thead><tbody>{list.map((p) => {
          const s = sumBy.get(p.id); const tot = (s?.buildings ?? 0) * perB; const pct = tot ? Math.round((s!.done / tot) * 100) : 0;
          return (<tr key={p.id} className="cursor-pointer border-t border-slate-100 hover:bg-brand-50" onClick={() => setPid(p.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setPid(p.id)}>
            <td className="td whitespace-nowrap">{p.project_no ?? '—'}</td><td className="td min-w-[16rem] font-medium text-brand-900">{p.name}</td><td className="td whitespace-nowrap text-xs">{(mgrsOf.get(p.id) ?? []).map((i) => empName.get(i)).filter(Boolean).join(', ') || '—'}</td><td className="td"><StatusBadge status={p.status} /></td>
            <td className="td text-center">{s?.buildings ?? 0}</td><td className="td"><span className="flex items-center gap-2"><Bar pct={pct} /><span className="text-xs">{tot ? `${pct}%` : '—'}</span></span></td>
            <td className="td text-center">{s?.doing || '—'}</td><td className="td text-center">{s?.hold || '—'}</td></tr>); })}</tbody></table></div>)}
    </div>
  );
}

function Dashboard({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { me, data } = useApp(); const toast = useToast();
  const p = data.projects.find((x) => x.id === projectId)!;
  const asg = data.assignments.filter((a) => a.project_id === projectId);
  const editable = canEditProject(me, asg.filter((a) => a.role === 'manager').map((a) => a.employee_id), asg.filter((a) => a.role === 'coordinator').map((a) => a.employee_id)) !== 'none';
  const [d, setD] = useState<{ contents: Content[]; buildings: Building[]; nodes: Row[]; linked: string[] } | null>(null);
  const [cur, setCur] = useState<string | null>(null); const [sel, setSel] = useState<string | null>(null); const [phase, setPhase] = useState<string | null>(null); const [zoom, setZoom] = useState(1.25); const [mapEl, setMapEl] = useState<HTMLDivElement | null>(null); const zoomRef = useRef(1.25); zoomRef.current = zoom;
  const [add, setAdd] = useState(''); const [del, setDel] = useState<Building | null>(null);
  const load = useCallback(async () => { try { const r = await api<{ contents: Content[]; buildings: Building[]; nodes: Row[]; linked: string[] }>(`/api/process?project_id=${projectId}`); setD(r); setCur((c) => (c && r.buildings.some((b) => b.id === c) ? c : r.buildings[0]?.id ?? null)); } catch (e: any) { toast(e.message, 'err'); } }, [projectId, toast]);
  useEffect(() => { load(); }, [load]);
  // Ctrl (or Cmd) + mouse wheel zooms the map only (the browser page does not zoom); the point under the cursor stays put
  useEffect(() => {
    if (!mapEl) return;
    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return; ev.preventDefault();
      const old = zoomRef.current, nz = Math.min(2.5, Math.max(0.4, +(old * (ev.deltaY < 0 ? 1.1 : 1 / 1.1)).toFixed(3))); if (nz === old) return;
      const r = mapEl.getBoundingClientRect(), ox = ev.clientX - r.left, oy = ev.clientY - r.top, k = nz / old;
      flushSync(() => setZoom(nz)); mapEl.scrollLeft = (mapEl.scrollLeft + ox) * k - ox; mapEl.scrollTop = (mapEl.scrollTop + oy) * k - oy;
    };
    mapEl.addEventListener('wheel', onWheel, { passive: false }); return () => mapEl.removeEventListener('wheel', onWheel);
  }, [mapEl]);
  const states = useMemo(() => { const m: Record<string, StateMap> = {}; for (const r of d?.nodes ?? []) (m[r.building_id] ??= {})[r.node_key] = { status: r.status, comment: r.comment, updated_by: r.updated_by, updated_at: r.updated_at }; return m; }, [d]);
  if (!p) return null;
  const free = (d?.contents ?? []).filter((c) => !d!.buildings.some((b) => b.content_id === c.id));
  const b = d?.buildings.find((x) => x.id === cur) ?? null; const st: StateMap = (b && states[b.id]) || {};
  const prog = progressOf(st);
  const all = (d?.buildings ?? []).reduce((a, x) => { const pr = progressOf(states[x.id] ?? {}); return { done: a.done + pr.by.Completed, total: a.total + pr.total }; }, { done: 0, total: 0 });

  return (
    <div className="space-y-4">
      <PageHeader title={`${p.project_no ? p.project_no + ' · ' : ''}${p.name}`} subtitle="Design Stage BIM Workflow — mobilization and BIM kick-off, model development, coordination, quality control, submission and close-out."
        actions={<button className="btn-secondary" onClick={onBack}><ArrowLeft size={16} />All projects</button>} />
      {!d ? <Spinner /> : <>
        <div className="card flex flex-wrap items-end gap-3 p-3">
          <div className="min-w-[12rem]"><p className="text-xs text-slate-500">Project progress</p><div className="flex items-center gap-2"><Bar pct={all.total ? Math.round((all.done / all.total) * 100) : 0} /><b className="text-sm">{all.total ? Math.round((all.done / all.total) * 100) : 0}%</b><span className="text-xs text-slate-500">{d.buildings.length} building{d.buildings.length === 1 ? '' : 's'}</span></div></div>
          {editable && <div className="ml-auto flex flex-wrap items-end gap-2">
            <Field label="Add a building to the map"><select className="input w-64" value={add} onChange={(e) => setAdd(e.target.value)}><option value="">{free.length ? '— select from the project contents —' : d.contents.length ? 'All project contents are already added' : 'No project contents yet'}</option>{free.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>)}</select></Field>
            <button className="btn-primary" disabled={!add} onClick={async () => { try { const r: any = await api('/api/process/buildings', { body: { project_id: projectId, content_id: add } }); setAdd(''); toast('Building added'); await load(); setCur(r.id); } catch (e: any) { toast(e.message, 'err'); } }}><Plus size={16} />Add</button></div>}
        </div>
        {editable && !d.contents.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This project has no contents yet. Open the project in the Projects tab and add its buildings under <b>Project contents</b>; they will then appear in the list above.</p>}
        {!editable && <p className="text-xs text-slate-500">View only — the Administrator and the BIM Manager / BIM Coordinator assigned to this project update the map.</p>}

        {!d.buildings.length ? <Empty title="No buildings on the map yet" hint={editable ? 'Choose a building from the project contents and press Add.' : 'The project team has not added any building yet.'} /> : <>
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Buildings">{d.buildings.map((x) => { const pr = progressOf(states[x.id] ?? {}); return <button key={x.id} role="tab" aria-selected={cur === x.id} onClick={() => setCur(x.id)} className={`rounded-lg border px-3 py-1.5 text-sm ${cur === x.id ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white hover:border-brand-400'}`}>{x.name} <span className="ml-1 text-xs opacity-80">{pr.pct}%</span></button>; })}</div>
          {b && <div className="card p-3">
            <div className="mb-2 flex flex-wrap items-center gap-3"><h2 className="font-semibold text-brand-900">{b.name} <span className="text-xs font-normal text-slate-500">({b.kind})</span></h2>
              <span className="flex flex-wrap gap-2 text-xs">{PROCESS_STATUSES.map((s) => <span key={s} className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PROCESS_COLORS[s] }} />{s}: <b>{prog.by[s]}</b></span>)}<b className="px-1 py-0.5">{prog.pct}% complete</b></span>
              <span className="ml-auto flex items-center gap-1"><button className="btn-secondary btn-sm" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))}><Minus size={14} /></button><span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span><button className="btn-secondary btn-sm" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}><Plus size={14} /></button>
                {editable && <button className="btn-ghost btn-sm text-red-600" aria-label="Remove building from the map" onClick={() => setDel(b)}><Trash2 size={14} /></button>}</span></div>
            <div className="mb-2"><Legend /></div>
            <div ref={setMapEl} className="max-h-[calc(100vh-20rem)] min-h-[24rem] overflow-auto rounded-lg border border-slate-200 text-slate-400"><ProcessDiagram states={st} selected={sel} onSelect={setSel} zoom={zoom} onPhaseClick={setPhase} /></div>
            {Object.keys(alarmsOf(st)).length > 0 && <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700" role="alert">⚠ {Object.keys(alarmsOf(st)).length} activit{Object.keys(alarmsOf(st)).length === 1 ? 'y was' : 'ies were'} started before the previous activities were completed (red triangle on the map).</p>}
            <p className="mt-2 text-xs text-slate-500">Hold Ctrl and scroll the mouse wheel over the map to zoom. {editable ? 'Click any activity or decision to set its status and add a comment.' : 'Click an activity to see its details.'} Solid arrows are the process flow; dashed arrows are information and deliverables.</p>
          </div>}
        </>}
        {phase && b && <PhaseModal linked={d.linked} phaseId={phase} building={b} buildings={d.buildings} state={st} editable={editable} onClose={() => setPhase(null)} onSaved={async () => { setPhase(null); await load(); }} />}
        {sel && b && <NodeModal linked={d.linked.includes(sel)} building={b} buildings={d.buildings} allStates={states} nodeKey={sel} state={st[sel]} editable={editable} onClose={() => setSel(null)} onSaved={async () => { setSel(null); await load(); }} />}
        <Confirm open={!!del} title="Remove building from the map" message={`Remove ${del?.name} from the BIM Process Map? Its status history is deleted (the project content itself stays).`} confirmLabel="Remove" danger onClose={() => setDel(null)} onConfirm={async () => { const x = del!; setDel(null); try { await api(`/api/process/buildings/${x.id}`, { method: 'DELETE' }); toast('Building removed'); await load(); } catch (e: any) { toast(e.message, 'err'); } }} />
      </>}
    </div>
  );
}

function NodeModal({ linked, building, buildings, allStates, nodeKey, state, editable, onClose, onSaved }: { linked: boolean; building: Building; buildings: Building[]; allStates: Record<string, StateMap>; nodeKey: string; state?: NodeState; editable: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const n = nodeById.get(nodeKey)!; const lane = laneOf(nodeKey);
  const [status, setStatus] = useState<ProcessStatus>(state?.status ?? 'Not Started'); const [comment, setComment] = useState(state?.comment ?? '');
  const [all, setAll] = useState(linked);
  const started = STARTED.includes(status);
  const unmet = started ? unmetPrereqs(allStates[building.id] ?? {}, nodeKey) : [];
  const others = all && started ? buildings.filter((x) => x.id !== building.id).map((x) => ({ x, u: unmetPrereqs(allStates[x.id] ?? {}, nodeKey) })).filter((r) => r.u.length) : [];
  const save = async () => { try { await api('/api/process/nodes', { method: 'PUT', body: { building_id: building.id, node_key: nodeKey, status, comment: comment.trim() || null, apply_all: all } }); toast(all ? 'Status saved for all buildings' : 'Status saved'); onSaved(); } catch (e: any) { toast(e.message, 'err'); } };
  return <Modal open onClose={onClose} title={n.label} footer={<><button className="btn-secondary" onClick={onClose}>{editable ? 'Cancel' : 'Close'}</button>{editable && <button className={unmet.length ? 'btn-danger' : 'btn-primary'} onClick={save}>{unmet.length ? 'Save anyway' : 'Save'}</button>}</>}>
    <div className="space-y-3">
      <p className="text-xs text-slate-500"><Workflow size={12} className="mr-1 inline" />{lane?.label} · {building.name}</p>
      {n.note && <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">{n.note}</p>}
      <div><p className="label">Status</p><div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Status">{PROCESS_STATUSES.map((s) => <button key={s} type="button" role="radio" aria-checked={status === s} disabled={!editable} onClick={() => setStatus(s)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${status === s ? 'border-2' : 'border-slate-300'} ${editable ? '' : 'opacity-70'}`} style={status === s ? { borderColor: PROCESS_COLORS[s] } : undefined}><span className="h-3 w-3 shrink-0 rounded" style={{ background: PROCESS_COLORS[s] }} />{s}</button>)}</div></div>
      {(unmet.length > 0 || others.length > 0) && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">⚠ Warning — this activity is being started before the previous activities are completed.</p>
        {unmet.length > 0 && <ul className="mt-1 list-disc pl-5">{unmet.map((i) => <li key={i}>{nodeById.get(i)!.label} <span className="text-xs">({allStates[building.id]?.[i]?.status ?? 'Not Started'})</span></li>)}</ul>}
        {others.map((r) => <p key={r.x.id} className="mt-1 text-xs">Also in {r.x.name}: {r.u.map((i) => nodeById.get(i)!.label).join(', ')}</p>)}</div>}
      {editable && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Apply this status to <b>all buildings</b> of the project ({buildings.length}), not only {building.name}<span className="block text-xs text-slate-500">While ticked, this activity is kept the same in every building, including buildings added to the map later. Untick and save to manage it per building. The comment stays on this building only.</span></span></label>}
      <Field label="Comment"><textarea rows={3} className="input" disabled={!editable} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={status === 'On Hold' ? 'What is it waiting for?' : ''} /></Field>
      {state?.updated_at && <p className="text-xs text-slate-500">Last updated by {state.updated_by ?? '—'} on {fmtDateTime(new Date(state.updated_at))}</p>}
    </div>
  </Modal>;
}

function PhaseModal({ linked, phaseId, building, buildings, state, editable, onClose, onSaved }: { linked: string[]; phaseId: string; building: Building; buildings: Building[]; state: StateMap; editable: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const ph = PHASES.find((p) => p.id === phaseId)!;
  const nodes = useMemo(() => NODES.filter((n) => phaseOf(n).id === phaseId), [phaseId]);
  const [vals, setVals] = useState<Record<string, ProcessStatus>>(() => Object.fromEntries(nodes.map((n) => [n.id, state[n.id]?.status ?? 'Not Started'])));
  const [all, setAll] = useState(nodes.length > 0 && nodes.every((n) => linked.includes(n.id)));
  const [busy, setBusy] = useState(false);
  const setEvery = (s: ProcessStatus) => setVals(Object.fromEntries(nodes.map((n) => [n.id, s])));
  const changed = nodes.filter((n) => (state[n.id]?.status ?? 'Not Started') !== vals[n.id]);
  const save = async () => {
    setBusy(true);
    try { await api('/api/process/phase', { method: 'PUT', body: { building_id: building.id, items: (all ? nodes : changed).map((n) => ({ node_key: n.id, status: vals[n.id] })), apply_all: all } }); toast(all ? 'Saved for all buildings' : `${changed.length} activities updated`); onSaved(); }
    catch (e: any) { toast(e.message, 'err'); setBusy(false); }
  };
  return <Modal open onClose={onClose} title={`${PHASES.indexOf(ph) + 1}. ${ph.label} — all activities`} footer={<><button className="btn-secondary" onClick={onClose}>{editable ? 'Cancel' : 'Close'}</button>{editable && <button className="btn-primary" disabled={busy || (!all && !changed.length)} onClick={save}>Save{!all && changed.length ? ` (${changed.length})` : ''}</button>}</>}>
    <div className="space-y-3">
      <p className="text-xs text-slate-500"><Workflow size={12} className="mr-1 inline" />{building.name} · {nodes.length} activities</p>
      {editable && <div><p className="label">Set all to</p><div className="flex flex-wrap gap-2">{PROCESS_STATUSES.map((s) => <button key={s} type="button" className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2 py-1 text-xs" onClick={() => setEvery(s)}><span className="h-3 w-3 rounded" style={{ background: PROCESS_COLORS[s] }} />{s}</button>)}</div></div>}
      <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
        {nodes.map((n) => <li key={n.id} className="flex items-center gap-2 px-2 py-1.5 text-sm"><span className="h-3 w-3 shrink-0 rounded" style={{ background: PROCESS_COLORS[vals[n.id]] }} /><span className="min-w-0 flex-1"><span className="block truncate" title={n.label}>{n.label}</span><span className="block text-[11px] text-slate-500">{laneOf(n.id)?.label}</span></span>
          <select aria-label={`Status of ${n.label}`} className="input w-36 py-1 text-xs" disabled={!editable} value={vals[n.id]} onChange={(e) => setVals((v) => ({ ...v, [n.id]: e.target.value as ProcessStatus }))}>{PROCESS_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></li>)}
      </ul>
      {editable && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Apply these statuses to <b>all buildings</b> of the project ({buildings.length}), not only {building.name}<span className="block text-xs text-slate-500">Keeps these activities the same in every building. Untick to change only this building. Comments are kept.</span></span></label>}
    </div>
  </Modal>;
}
