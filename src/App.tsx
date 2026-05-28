import React, { useMemo, useState } from 'react';

async function loadJsonFromUrl(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
  return res.json();
}

type WorkUnitEntity = {
  id: string;
  world: string;
  type: string;
  name: string;
  confidence?: number;
  trajectoryIds?: string[];
  plannedActions?: string[];
};

type Trajectory = {
  id: string;
  name: string;
  description?: string;
  expected_benefits?: string[];
  risks?: string[];
};

type SimulationReport = {
  trajectory_id: string;
  risk?: string;
  confidence?: number;
  expected_impact?: Record<string, string>;
};

type WorkUnit = {
  id: string;
  title?: string;
  impactSurface?: { entities?: WorkUnitEntity[] };
  trajectories?: Trajectory[];
  simulationReports?: SimulationReport[];
};

type RankedNode = {
  id: string;
  world: string;
  risk: number;
  impact: number;
  score: number;
};

type MeshNode = RankedNode & { x: number; y: number; radius: number; idx: number };
type UnpackedNode = { id: string; parentId: string; world: string; label: string; x: number; y: number; kind: 'counterfactual' | 'simulation' | 'action' };

type GoalPreset = {
  label: string;
  impactWeight: number;
  riskWeight: number;
  confidenceThreshold: number;
  description: string;
};

const sampleWorkUnit: WorkUnit = {
  id: 'wu_sample_001',
  title: 'Sample: TF->PyTorch migration impact work unit',
  impactSurface: {
    entities: [
      { id: 'e1', world: 'code', type: 'file', name: 'docs/migration/tf_to_torch.md', confidence: 0.86, trajectoryIds: ['traj_onboarding_first'], plannedActions: ['Refactor this module behind a feature flag and keep old path as fallback.', 'Add contract/regression tests before cutover.'] },
      { id: 'e2', world: 'code', type: 'file', name: 'examples/distributed/ddp_tutorial.py', confidence: 0.82, trajectoryIds: ['traj_onboarding_first', 'traj_perf_reliability_first'], plannedActions: ['Ship adapter layer for TensorFlow->PyTorch compatibility.', 'Benchmark before/after and set automatic rollback thresholds.'] },
      { id: 'e3', world: 'runtime', type: 'metric', name: 'p95_training_step_latency', confidence: 0.74, trajectoryIds: ['traj_perf_reliability_first'], plannedActions: ['Canary rollout with p95/p99 and failure-rate guardrails.', 'Tune worker concurrency and caching for hot paths.'] },
      { id: 'e4', world: 'business', type: 'kpi', name: 'enterprise_migration_conversion', confidence: 0.79, trajectoryIds: ['traj_perf_reliability_first'], plannedActions: ['Tie rollout to KPI checkpoints and weekly decision gates.'] },
      { id: 'e5', world: 'user', type: 'journey', name: 'first_successful_training_run', confidence: 0.77, trajectoryIds: ['traj_onboarding_first'], plannedActions: ['Instrument first-success journey and onboarding drop-off.'] }
    ]
  },
  trajectories: [
    {
      id: 'traj_onboarding_first',
      name: 'Onboarding-first migration',
      description: 'Prioritize docs/tutorial/examples + compatibility guidance to reduce migration friction.',
      expected_benefits: ['faster developer adoption', 'lower migration confusion'],
      risks: ['slower infra-level wins']
    },
    {
      id: 'traj_perf_reliability_first',
      name: 'Performance/reliability-first migration',
      description: 'Prioritize stability and benchmark evidence for enterprise migration confidence.',
      expected_benefits: ['stronger production confidence', 'better conversion for performance-sensitive teams'],
      risks: ['higher engineering complexity']
    }
  ],
  simulationReports: [
    {
      trajectory_id: 'traj_onboarding_first',
      risk: 'low',
      confidence: 0.68,
      expected_impact: {
        migration_adoption: '+8%..+18%',
        time_to_first_success: '-20%..-35%'
      }
    },
    {
      trajectory_id: 'traj_perf_reliability_first',
      risk: 'medium',
      confidence: 0.66,
      expected_impact: {
        enterprise_conversion: '+6%..+14%',
        p95_latency: '-10%..-22%',
        training_failure_rate: '-8%..-15%'
      }
    }
  ]
};

const fallbackNodes = [
  { id: 'code:modelPool.ts', world: 'code', risk: 0.6, impact: 0.8 },
  { id: 'runtime:p95_latency', world: 'runtime', risk: 0.3, impact: 0.9 },
  { id: 'user:login_wait', world: 'user', risk: 0.4, impact: 0.7 },
  { id: 'business:onboarding_conversion', world: 'business', risk: 0.5, impact: 0.85 }
];

const goalPresets: Record<string, GoalPreset> = {
  balanced: {
    label: 'Balanced delivery', impactWeight: 0.7, riskWeight: 0.3, confidenceThreshold: 0.65,
    description: 'General planning mode across impact and execution risk.'
  },
  growth: {
    label: 'Growth / expansion', impactWeight: 0.88, riskWeight: 0.12, confidenceThreshold: 0.58,
    description: 'Bias toward upside opportunities, tolerate more uncertainty.'
  },
  reliability: {
    label: 'Reliability / risk control', impactWeight: 0.52, riskWeight: 0.48, confidenceThreshold: 0.76,
    description: 'Bias toward safer bets and stronger evidence before action.'
  },
  adoption: {
    label: 'Adoption / onboarding', impactWeight: 0.78, riskWeight: 0.22, confidenceThreshold: 0.62,
    description: 'Optimize for user activation and first-value experiences.'
  }
};

function nodeShortLabel(id: string): string {
  return id.split('/').pop() ?? id;
}

function wrapLabel(text: string, max = 16): string[] {
  const clean = text.replace(/[_:]/g, ' ').trim();
  const parts = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const p of parts) {
    if (!current) current = p;
    else if ((current + ' ' + p).length <= max) current += ' ' + p;
    else {
      lines.push(current);
      current = p;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function transitionHow(fromWorld: string, toWorld: string): string {
  const key = `${fromWorld}->${toWorld}`;
  const map: Record<string, string> = {
    'code->runtime': 'by changing executable behavior and operating characteristics',
    'runtime->user': 'by improving perceived responsiveness and reliability in the user journey',
    'user->business': 'by increasing conversion and retention outcomes',
    'code->business': 'by reducing delivery friction and accelerating value realization',
    'runtime->business': 'by lowering failure/latency costs that affect growth and trust',
    'business->user': 'by enabling product investment loops that improve user experience',
    'user->runtime': 'by shifting traffic and usage patterns that stress runtime systems'
  };
  return map[key] ?? 'through cross-layer propagation effects';
}

function practicalActionsForWorld(world: string): string[] {
  if (world === 'code') return [
    'Introduce targeted refactors behind feature flags in affected modules.',
    'Add regression tests around changed interfaces and edge-case fixtures.',
    'Create migration adapters and deprecation warnings for old call paths.'
  ];
  if (world === 'runtime') return [
    'Add p95/p99 tracing and error-budget SLO alerts before rollout.',
    'Run canary deployment with auto-rollback guardrails.',
    'Tune concurrency, caching, and retry policies with load-test evidence.'
  ];
  if (world === 'user') return [
    'Instrument onboarding funnel events at each UX step.',
    'Ship copy/flow variants behind experiment flags and compare conversion.',
    'Capture top drop-off reasons and map to backlog fixes.'
  ];
  return [
    'Translate technical change into KPI hypotheses with target deltas.',
    'Define weekly decision checkpoints tied to adoption/retention metrics.',
    'Set rollback/continue criteria so teams can act without ambiguity.'
  ];
}

function worldHint(entityName: string, world: string, t: Trajectory): boolean {
  const text = `${entityName} ${world} ${t.name} ${t.description ?? ''}`.toLowerCase();
  if (world === 'code') return /(code|migration|adapter|tutorial|docs|refactor)/.test(text);
  if (world === 'runtime') return /(runtime|latency|training|stability|benchmark|perf)/.test(text);
  if (world === 'user') return /(user|onboarding|first|journey|adoption)/.test(text);
  return /(business|conversion|enterprise|kpi|retention)/.test(text);
}

function buildUnpackItems(workUnit: WorkUnit | null, selected: MeshNode): Array<{ kind: UnpackedNode['kind']; label: string }> {
  const out: Array<{ kind: UnpackedNode['kind']; label: string }> = [];
  const trajectories = workUnit?.trajectories ?? [];
  const reports = workUnit?.simulationReports ?? [];
  const entity = (workUnit?.impactSurface?.entities ?? []).find((e) => e.name === selected.id);

  const linkedIds = entity?.trajectoryIds?.length
    ? entity.trajectoryIds
    : trajectories.filter((t) => worldHint(selected.id, selected.world, t)).map((t) => t.id);

  for (const trajId of linkedIds) {
    const t = trajectories.find((x) => x.id === trajId);
    if (!t) continue;
    out.push({ kind: 'counterfactual', label: `Counterfactual: skip ${t.name.toLowerCase()}` });
    const sim = reports.find((r) => r.trajectory_id === t.id);
    if (sim?.expected_impact) {
      for (const [k, v] of Object.entries(sim.expected_impact)) {
        out.push({ kind: 'simulation', label: `Simulation: ${k} -> ${v}` });
      }
    }
  }

  const entityActions = entity?.plannedActions?.length ? entity.plannedActions : practicalActionsForWorld(selected.world);
  for (const a of entityActions) out.push({ kind: 'action', label: `Action: ${a}` });

  const dedup = new Map<string, { kind: UnpackedNode['kind']; label: string }>();
  for (const i of out) {
    const key = `${i.kind}|${i.label}`;
    if (!dedup.has(key)) dedup.set(key, i);
  }
  return Array.from(dedup.values());
}

export function App() {
  const [impactWeight, setImpactWeight] = useState(0.7);
  const [riskWeight, setRiskWeight] = useState(0.3);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.65);
  const [goalMode, setGoalMode] = useState<keyof typeof goalPresets>('balanced');

  const [focusZoom, setFocusZoom] = useState(1);
  const [hopDepth, setHopDepth] = useState<1 | 2>(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [lastPointer, setLastPointer] = useState<{ x: number; y: number } | null>(null);

  const [leftPaneOpen, setLeftPaneOpen] = useState(true);
  const [rightPaneOpen, setRightPaneOpen] = useState(true);

  const [rawJson, setRawJson] = useState('');
  const [jsonUrl, setJsonUrl] = useState('');
  const [workUnit, setWorkUnit] = useState<WorkUnit | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedNodes = useMemo(() => {
    const entities = workUnit?.impactSurface?.entities ?? [];
    if (!entities.length) return [];
    return entities.map((e) => ({
      id: e.name,
      world: e.world,
      risk: 1 - (e.confidence ?? 0.65),
      impact: 0.55 + Math.min(0.4, (e.confidence ?? 0.65) * 0.5)
    }));
  }, [workUnit]);

  const ranked = useMemo<RankedNode[]>(() => {
    const base = parsedNodes.length ? parsedNodes : fallbackNodes;
    return [...base]
      .map((n) => ({ ...n, score: n.impact * impactWeight - n.risk * riskWeight }))
      .filter((n) => n.score >= confidenceThreshold - 0.5)
      .sort((a, b) => b.score - a.score);
  }, [parsedNodes, impactWeight, riskWeight, confidenceThreshold]);

  const worldOrder = ['code', 'runtime', 'user', 'business'];
  const worldX = new Map(worldOrder.map((w, i) => [w, 120 + i * 190]));
  const meshWidth = 920;
  const meshHeight = 520;

  const meshNodes = useMemo<MeshNode[]>(() => {
    if (!ranked.length) return [];
    return ranked.map((n, idx) => {
      const x = worldX.get(n.world) ?? 120;
      const y = 80 + idx * ((meshHeight - 150) / Math.max(1, ranked.length - 1));
      const radius = 11 + Math.max(0, n.score) * 14;
      return { ...n, x, y, radius, idx };
    });
  }, [ranked]);

  const selectedNode = meshNodes.find((n) => n.id === selectedNodeId) ?? null;

  const selectedNeighbors = useMemo(() => {
    if (!selectedNode) return [] as MeshNode[];
    const byId = new Set<string>();
    const out: MeshNode[] = [];
    const push = (i: number) => {
      if (i < 0 || i >= meshNodes.length) return;
      const n = meshNodes[i];
      if (n.id === selectedNode.id || byId.has(n.id)) return;
      byId.add(n.id);
      out.push(n);
    };
    push(selectedNode.idx - 1);
    push(selectedNode.idx + 1);
    if (hopDepth === 2) {
      push(selectedNode.idx - 2);
      push(selectedNode.idx + 2);
    }
    return out;
  }, [meshNodes, selectedNode, hopDepth]);

  const focusedNodes = useMemo(() => {
    if (!selectedNode) return meshNodes;
    return meshNodes;
  }, [meshNodes, selectedNode]);

  const focusedById = useMemo(() => new Map(focusedNodes.map((n) => [n.id, n])), [focusedNodes]);

  const meshLinks = useMemo(() => {
    if (meshNodes.length < 2) return [] as Array<{ from: MeshNode; to: MeshNode }>;
    const links: Array<{ from: MeshNode; to: MeshNode }> = [];
    for (let i = 0; i < meshNodes.length - 1; i += 1) {
      const from = focusedById.get(meshNodes[i].id) ?? meshNodes[i];
      const to = focusedById.get(meshNodes[i + 1].id) ?? meshNodes[i + 1];
      links.push({ from, to });
    }
    return links;
  }, [meshNodes, focusedById]);

  const worldStats = useMemo(() => {
    const counts = { code: 0, runtime: 0, user: 0, business: 0 } as Record<string, number>;
    for (const n of ranked) counts[n.world] = (counts[n.world] ?? 0) + 1;
    return counts;
  }, [ranked]);

  const unpackedNodes = useMemo<UnpackedNode[]>(() => {
    if (!selectedNode) return [];
    const items = buildUnpackItems(workUnit, selectedNode);
    const levels = Math.max(1, Math.round(focusZoom));
    const perLevel = levels === 1 ? 3 : levels === 2 ? 6 : items.length;
    const sliced = items.slice(0, Math.max(1, perLevel));
    if (!sliced.length) return [];

    return sliced.map((t, i) => {
      const ring = i < 4 ? 56 : i < 8 ? 96 : 132;
      const angle = (Math.PI * 2 * i) / sliced.length;
      return {
        id: `${selectedNode.id}-u-${i}`,
        parentId: selectedNode.id,
        world: selectedNode.world,
        label: t.label,
        x: selectedNode.x + Math.cos(angle) * ring,
        y: selectedNode.y + Math.sin(angle) * ring,
        kind: t.kind
      };
    });
  }, [selectedNode, focusZoom, workUnit]);

  const overallNarrative = useMemo(() => {
    if (!ranked.length) return 'Current calibration filters out all entities. Relax evidence strictness or risk sensitivity to surface candidate levers.';
    const top = ranked[0];
    const mode = goalPresets[goalMode];
    return `In ${mode.label.toLowerCase()} mode, ${ranked.length} entities are prioritized. Primary near-term lever: ${nodeShortLabel(top.id)} in ${top.world}. Coverage is code ${worldStats.code}, runtime ${worldStats.runtime}, user ${worldStats.user}, business ${worldStats.business}.`;
  }, [ranked, goalMode, worldStats]);

  const nodeNarrative = useMemo(() => {
    if (!selectedNode) return null;
    if (!selectedNeighbors.length) return `${nodeShortLabel(selectedNode.id)} currently has no ${hopDepth}-hop neighbors in the filtered mesh. Lower strictness to reveal propagation context.`;
    const how = selectedNeighbors
      .map((n) => `${nodeShortLabel(selectedNode.id)} influences ${nodeShortLabel(n.id)} ${transitionHow(selectedNode.world, n.world)}`)
      .join('; ');
    return `Contribution mechanism: ${how}.`;
  }, [selectedNode, selectedNeighbors, hopDepth]);

  const practicalActions = useMemo(() => {
    if (!selectedNode) return [] as string[];
    const fromUnpacked = unpackedNodes
      .filter((u) => u.kind === 'action')
      .map((u) => u.label.replace(/^Action:\s*/i, ''));
    return fromUnpacked.length ? fromUnpacked : practicalActionsForWorld(selectedNode.world);
  }, [selectedNode, unpackedNodes]);

  const impactPathNarrative = useMemo(() => {
    if (!selectedNode || !selectedNeighbors.length) return null;
    const chain = [selectedNode, ...selectedNeighbors]
      .map((n) => `${nodeShortLabel(n.id)} [${n.world}]`)
      .join(' -> ');
    return `Impact path (${hopDepth}-hop): ${chain}.`;
  }, [selectedNode, selectedNeighbors, hopDepth]);

  const applyGoalPreset = (key: keyof typeof goalPresets) => {
    const p = goalPresets[key];
    setGoalMode(key);
    setImpactWeight(p.impactWeight);
    setRiskWeight(p.riskWeight);
    setConfidenceThreshold(p.confidenceThreshold);
  };

  const onLoadJson = () => {
    try {
      const parsed = JSON.parse(rawJson) as WorkUnit;
      if (!parsed?.id) return setError('JSON does not look like a WorkUnit (missing id).');
      setWorkUnit(parsed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onLoadFromUrl = async () => {
    try {
      const parsed = (await loadJsonFromUrl(jsonUrl)) as WorkUnit;
      if (!parsed?.id) return setError('URL JSON does not look like a WorkUnit (missing id).');
      setRawJson(JSON.stringify(parsed, null, 2));
      setWorkUnit(parsed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onLoadFromFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as WorkUnit;
      if (!parsed?.id) return setError('File JSON does not look like a WorkUnit (missing id).');
      setRawJson(JSON.stringify(parsed, null, 2));
      setWorkUnit(parsed);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: 20 }}>
      <h1>Worldforge Instantiation Visualization</h1>
      <p>Calibration knobs + potential impact mesh view</p>

      <h2>Load WorkUnit JSON</h2>
      <p>Paste JSON, load from URL, or import local .json exported by the backend.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input type='url' value={jsonUrl} onChange={(e) => setJsonUrl(e.target.value)} placeholder='https://.../workunit.json' style={{ flex: 1 }} />
        <button onClick={onLoadFromUrl} disabled={!jsonUrl.trim()}>Load from URL</button>
        <label style={{ border: '1px solid #ccc', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>
          Load file
          <input type='file' accept='application/json,.json' onChange={onLoadFromFile} style={{ display: 'none' }} />
        </label>
        <button onClick={() => { setWorkUnit(sampleWorkUnit); setRawJson(JSON.stringify(sampleWorkUnit, null, 2)); setError(null); }}>Load sample</button>
      </div>

      <textarea value={rawJson} onChange={(e) => setRawJson(e.target.value)} placeholder='{"id":"wu_...","impactSurface":{"entities":[...]}}' style={{ width: '100%', minHeight: 140 }} />
      <div style={{ marginTop: 8 }}><button onClick={onLoadJson}>Load WorkUnit</button></div>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {workUnit && <p>Loaded WorkUnit: <b>{workUnit.id}</b>{workUnit.title ? ` — ${workUnit.title}` : ''}</p>}

      <h2>Potential impact mesh</h2>
      <div style={{ display: 'grid', gridTemplateColumns: `${leftPaneOpen ? '300px' : '44px'} 1fr ${rightPaneOpen ? '340px' : '44px'}`, gap: 10, alignItems: 'start' }}>
        <aside style={{ border: '1px solid #d5deef', borderRadius: 8, background: '#f8faff', minHeight: 520 }}>
          <button onClick={() => setLeftPaneOpen((v) => !v)} style={{ width: '100%' }}>{leftPaneOpen ? 'Hide controls ◀' : '▶'}</button>
          {leftPaneOpen && (
            <div style={{ padding: 10, display: 'grid', gap: 10 }}>
              <label>Business goal mode
                <select value={goalMode} onChange={(e) => applyGoalPreset(e.target.value as keyof typeof goalPresets)} style={{ marginLeft: 8 }}>
                  {Object.entries(goalPresets).map(([key, preset]) => <option key={key} value={key}>{preset.label}</option>)}
                </select>
              </label>
              <p style={{ margin: 0, color: '#3b4a66' }}>{goalPresets[goalMode].description}</p>
              <label>Upside emphasis: {impactWeight.toFixed(2)}<input type='range' min={0} max={1} step={0.01} value={impactWeight} onChange={(e) => setImpactWeight(Number(e.target.value))} /></label>
              <label>Risk sensitivity: {riskWeight.toFixed(2)}<input type='range' min={0} max={1} step={0.01} value={riskWeight} onChange={(e) => setRiskWeight(Number(e.target.value))} /></label>
              <label>Evidence strictness: {confidenceThreshold.toFixed(2)}<input type='range' min={0.4} max={0.95} step={0.01} value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(Number(e.target.value))} /></label>
              <label>Node unpack level: {focusZoom.toFixed(1)}x<input type='range' min={1} max={3} step={1} value={focusZoom} onChange={(e) => setFocusZoom(Number(e.target.value))} /></label>
              <div>
                <button onClick={() => setPan({ x: 0, y: 0 })}>Reset pan</button>
                <span style={{ marginLeft: 8, color: '#60708f' }}>Drag mesh to pan</span>
              </div>
              <div>
                Neighborhood:
                <button onClick={() => setHopDepth(1)} style={{ marginLeft: 8, fontWeight: hopDepth === 1 ? 700 : 400 }}>1-hop</button>
                <button onClick={() => setHopDepth(2)} style={{ marginLeft: 6, fontWeight: hopDepth === 2 ? 700 : 400 }}>2-hop</button>
              </div>
            </div>
          )}
        </aside>

        <div>
          <svg
            viewBox={`0 0 ${meshWidth} ${meshHeight}`}
            width='100%'
            style={{ border: '1px solid #ddd', borderRadius: 10, background: '#fbfcff', maxHeight: 560, cursor: dragging ? 'grabbing' : 'grab' }}
            onMouseDown={(e) => { setDragging(true); setLastPointer({ x: e.clientX, y: e.clientY }); }}
            onMouseUp={() => { setDragging(false); setLastPointer(null); }}
            onMouseLeave={() => { setDragging(false); setLastPointer(null); }}
            onMouseMove={(e) => {
              if (!dragging || !lastPointer) return;
              const dx = e.clientX - lastPointer.x;
              const dy = e.clientY - lastPointer.y;
              setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
              setLastPointer({ x: e.clientX, y: e.clientY });
            }}
          >
            <g transform={`translate(${pan.x} ${pan.y})`}>
            {worldOrder.map((w) => {
              const x = worldX.get(w) ?? 120;
              return <g key={w}><line x1={x} y1={30} x2={x} y2={meshHeight - 20} stroke='#e9edf5' strokeWidth={2} /><text x={x} y={20} textAnchor='middle' fontSize={14} fill='#3a4a6a'>{w}</text></g>;
            })}
            {meshLinks.map((l, i) => {
              const active = selectedNode ? (l.from.id === selectedNode.id || l.to.id === selectedNode.id) : false;
              return <line key={i} x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} stroke={active ? '#3f63ff' : '#9fb8ff'} strokeWidth={active ? 2.5 : 1.3} opacity={selectedNode ? (active ? 0.95 : 0.2) : 0.7} />;
            })}
            {selectedNode && unpackedNodes.map((u) => (
              <line key={`ul-${u.id}`} x1={selectedNode.x} y1={selectedNode.y} x2={u.x} y2={u.y} stroke={u.kind === 'counterfactual' ? '#f59e0b' : u.kind === 'simulation' ? '#10b981' : '#6366f1'} strokeDasharray='4 3' strokeWidth={1.4} opacity={0.9} />
            ))}
            {focusedNodes.map((n) => {
              const selected = selectedNodeId === n.id;
              const isNeighbor = selectedNeighbors.some((s) => s.id === n.id);
              const muted = selectedNode ? !(selected || isNeighbor) : false;
              const lines = wrapLabel(nodeShortLabel(n.id), selected || isNeighbor ? 22 : 16);
              return (
                <g key={n.id} onClick={() => setSelectedNodeId(n.id)} style={{ cursor: 'pointer' }}>
                  <circle cx={n.x} cy={n.y} r={selected ? n.radius + 3 : isNeighbor ? n.radius + 1.5 : n.radius} fill={selected ? '#2d55f0' : isNeighbor ? '#6a8bff' : '#4f7cff'} fillOpacity={muted ? 0.22 : 0.9} stroke={selected ? '#132f9c' : '#2447bf'} strokeWidth={selected ? 2.2 : 1.2} />
                  <text x={n.x + 14} y={n.y - 4} fontSize={13} fill={muted ? '#94a1ba' : '#1f2a44'}>
                    {lines.map((line, idx) => <tspan key={idx} x={n.x + 14} dy={idx === 0 ? 0 : 14}>{line}</tspan>)}
                  </text>
                </g>
              );
            })}
            {selectedNode && unpackedNodes.map((u) => {
              const lines = wrapLabel(u.label, 20);
              const fill = u.kind === 'counterfactual' ? '#fff7e6' : u.kind === 'simulation' ? '#ecfeff' : '#eef2ff';
              const stroke = u.kind === 'counterfactual' ? '#f59e0b' : u.kind === 'simulation' ? '#10b981' : '#6366f1';
              return (
                <g key={u.id}>
                  <rect x={u.x - 46} y={u.y - 20} width={92} height={40} rx={8} fill={fill} stroke={stroke} strokeWidth={1.2} />
                  <text x={u.x - 40} y={u.y - 6} fontSize={10} fill='#1f2a44'>
                    {lines.slice(0, 2).map((line, idx) => <tspan key={idx} x={u.x - 40} dy={idx === 0 ? 0 : 12}>{line}</tspan>)}
                  </text>
                </g>
              );
            })}
            </g>
          </svg>
          {!focusedNodes.length && <p>No entities passed the current calibration threshold.</p>}
        </div>

        <aside style={{ border: '1px solid #d5deef', borderRadius: 8, background: '#f8faff', minHeight: 520 }}>
          <button onClick={() => setRightPaneOpen((v) => !v)} style={{ width: '100%' }}>{rightPaneOpen ? 'Hide explanations ▶' : '◀'}</button>
          {rightPaneOpen && (
            <div style={{ padding: 10, display: 'grid', gap: 10 }}>
              <div>
                <b>Expected impact narrative</b>
                <div style={{ marginTop: 6 }}>{overallNarrative}</div>
              </div>
              {selectedNode ? (
                <div>
                  <b>Node impact briefing</b>
                  <div style={{ marginTop: 6 }}>{nodeNarrative}</div>
                  {impactPathNarrative && <div style={{ marginTop: 8 }}><b>Impact path chain:</b> {impactPathNarrative}</div>}
                  <div style={{ marginTop: 8 }}><b>How it propagates:</b> {selectedNeighbors.length ? selectedNeighbors.map((n) => transitionHow(selectedNode.world, n.world)).join('; ') : 'No propagation path visible at current filters.'}</div>
                  {practicalActions.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <b>Practical org actions (codebase execution)</b>
                      <ul>
                        {practicalActions.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div>Select a node in the mesh to see mechanism-level impact explanation.</div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
