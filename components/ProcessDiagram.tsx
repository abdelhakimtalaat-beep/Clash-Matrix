'use client';
import { DIAGRAM_H, DIAGRAM_W, EDGES, LANES, LANE_LABEL_W, NODES, PHASES, PHASE_H, PROCESS_COLORS, phaseProgress, alarmsOf, nodeById, nodeSize, labelPos, pathOf, routeEdge, statusOf, wrapLabel, type PNode, type StateMap } from '@/lib/processMap';

const LINE = '#c0392b';
function Shape({ n, color }: { n: PNode; color: string }) {
  const { w, h } = nodeSize(n); const x = -w / 2, y = -h / 2;
  const common = { fill: color, fillOpacity: 0.22, stroke: color, strokeWidth: 1.6 } as const;
  if (n.kind === 'decision') return <polygon points={`0,${y} ${w / 2},0 0,${h / 2} ${-w / 2},0`} {...common} />;
  if (n.kind === 'input') { const k = 8; return <polygon points={`${x + k},${y} ${x + w},${y} ${x + w - k},${y + h} ${x},${y + h}`} {...common} />; }
  if (n.kind === 'start' || n.kind === 'end') return <rect x={x} y={y} width={w} height={h} rx={h / 2} {...common} />;
  return <rect x={x} y={y} width={w} height={h} rx={2} {...common} />;
}

/** The workflow, drawn from data: every node and connector is its own SVG element. Colour = status. */
export function ProcessDiagram({ states, selected, onSelect, zoom, onPhaseClick }: { states: StateMap; selected: string | null; onSelect: (id: string) => void; zoom: number; onPhaseClick?: (phaseId: string) => void }) {
  const alarms = alarmsOf(states);
  return (
    <svg width={DIAGRAM_W * zoom} height={(DIAGRAM_H + PHASE_H) * zoom} viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H + PHASE_H}`} role="group" aria-label="Design Stage BIM Workflow" className="block select-none">
      <defs>
        <marker id="pm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 L10 5 L0 9 z" fill={LINE} /></marker>
      </defs>
      <g aria-label="Phases">
        {phaseProgress(states).map((p) => (
          <g key={p.id} data-phase={p.id} {...(onPhaseClick ? { role: 'button', tabIndex: 0, style: { cursor: 'pointer' }, onClick: () => onPhaseClick(p.id), onKeyDown: (ev: { key: string; preventDefault: () => void }) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPhaseClick(p.id); } } } : {})}>
            <title>{`Click to set the status of all ${p.label} activities`}</title>
            <rect x={p.x0} y={0} width={p.x1 - p.x0} height={PHASE_H} fill={p.tint} fillOpacity={0.9} stroke="rgb(var(--surface))" strokeWidth={1.5} />
            <text x={(p.x0 + p.x1) / 2} y={PHASE_H / 2 + 4} textAnchor="middle" fontSize={12} fontWeight={700} fill="#fff">{`${PHASES.indexOf(PHASES.find((q) => q.id === p.id)!) + 1}. ${p.label} — ${p.done}/${p.total} done (${p.pct}%)`}</text>
          </g>
        ))}
      </g>
      <g transform={`translate(0 ${PHASE_H})`}>
      {LANES.map((l, i) => (
        <g key={l.id} data-lane={l.id}>
          <rect x={0} y={l.y0} width={DIAGRAM_W} height={l.y1 - l.y0} className={i % 2 ? 'fill-slate-100' : 'fill-surface'} fillOpacity={i % 2 ? 0.5 : 1} stroke="currentColor" strokeOpacity={0.25} />
          <line x1={LANE_LABEL_W} x2={LANE_LABEL_W} y1={l.y0} y2={l.y1} stroke="currentColor" strokeOpacity={0.25} />
          <text transform={`translate(${LANE_LABEL_W / 2 + 2} ${(l.y0 + l.y1) / 2}) rotate(-90)`} textAnchor="middle" fontSize={9} className="fill-slate-600" fontWeight={600}>{wrapLabel(l.label, 17).map((ln, i, a) => <tspan key={i} x={0} dy={i === 0 ? -(a.length - 1) * 5.5 : 11}>{ln}</tspan>)}</text>
        </g>
      ))}
      {PHASES.slice(1).map((p) => <line key={p.id} x1={p.x0} x2={p.x0} y1={0} y2={DIAGRAM_H} stroke={p.tint} strokeWidth={2} strokeDasharray="8 5" strokeOpacity={0.7} />)}
      <g aria-label="Connectors">
        {EDGES.map((e) => {
          const pts = routeEdge(e); const a = pts[0], b = pts[pts.length - 1]; const mid = pts[Math.min(1, pts.length - 1)];
          return (
            <g key={e.id} data-edge={e.id}>
              <path d={pathOf(pts)} fill="none" stroke={LINE} strokeWidth={1.3} strokeDasharray={e.dashed ? '5 3' : undefined} markerEnd="url(#pm-arrow)" strokeLinejoin="round" />
              {e.label && <text x={labelPos(pts).x} y={labelPos(pts).y} fontSize={9} fontWeight={600} className="fill-slate-700" stroke="rgb(var(--surface))" strokeWidth={3} paintOrder="stroke">{e.label}</text>}
            </g>);
        })}
      </g>
      <g aria-label="Activities">
        {NODES.map((n) => {
          const st = statusOf(states, n.id); const color = PROCESS_COLORS[st]; const { w, h } = nodeSize(n);
          const fs = n.kind === 'decision' ? 8 : 8.5; const maxc = Math.max(8, Math.floor((n.kind === 'decision' ? w * 0.72 : w - 8) / (fs * 0.52)));
          const lines = wrapLabel(n.label, maxc); const lh = fs + 1.6; const y0 = -((lines.length - 1) * lh) / 2 + 2.6;
          const sel = selected === n.id;
          return (
            <g key={n.id} data-node={n.id} data-status={st} transform={`translate(${n.x} ${n.y})`} role="button" tabIndex={0} aria-label={`${n.label} — ${st}${alarms[n.id] ? ' — warning: previous activities not completed' : ''}`} className="cursor-pointer outline-none [&:focus-visible_.ring]:stroke-brand-600"
              onClick={() => onSelect(n.id)} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(n.id); } }}>
              <title>{`${n.label} — ${st}${alarms[n.id] ? '\nWARNING: started before completing the previous activities: ' + alarms[n.id].map((i) => nodeById.get(i)!.label).join(', ') : ''}${n.note ? '\n' + n.note : ''}`}</title>
              <rect className="ring" x={-w / 2 - 4} y={-h / 2 - 4} width={w + 8} height={h + 8} rx={6} fill="none" stroke={sel ? 'rgb(var(--brand-600))' : 'transparent'} strokeWidth={2} />
              <Shape n={n} color={color} />
              <text textAnchor="middle" fontSize={fs} fontWeight={600} className="pointer-events-none fill-slate-800">{lines.map((t, i) => <tspan key={i} x={0} y={y0 + i * lh}>{t}</tspan>)}</text>
              <circle cx={n.kind === 'decision' ? 0 : w / 2 - 3} cy={n.kind === 'decision' ? -h / 2 + 1 : -h / 2 + 3} r={3.2} fill={color} stroke="rgb(var(--surface))" strokeWidth={1} />
              {alarms[n.id] && <g data-alarm={n.id} transform={`translate(${-w / 2 + 1} ${-h / 2 - 1})`}><path d="M0 -8 L8 6 L-8 6 Z" fill="#dc2626" stroke="rgb(var(--surface))" strokeWidth={1} strokeLinejoin="round" /><text y={4.6} textAnchor="middle" fontSize={9} fontWeight={800} fill="#fff" className="pointer-events-none">!</text></g>}
            </g>);
        })}
      </g>
      </g>
    </svg>
  );
}
export { nodeById };
