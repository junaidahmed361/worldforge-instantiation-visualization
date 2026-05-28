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
};

type WorkUnit = {
  id: string;
  title?: string;
  impactSurface?: { entities?: WorkUnitEntity[] };
};

type RankedNode = {
  id: string;
  world: string;
  risk: number;
  impact: number;
  score: number;
};

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
      { id: 'e1', world: 'code', type: 'file', name: 'docs/migration/tf_to_torch.md', confidence: 0.86 },
      { id: 'e2', world: 'code', type: 'file', name: 'examples/distributed/ddp_tutorial.py', confidence: 0.82 },
      { id: 'e3', world: 'runtime', type: 'metric', name: 'p95_training_step_latency', confidence: 0.74 },
      { id: 'e4', world: 'business', type: 'kpi', name: 'enterprise_migration_conversion', confidence: 0.79 },
      { id: 'e5', world: 'user', type: 'journey', name: 'first_successful_training_run', confidence: 0.77 }
    ]
  }
};

const fallbackNodes = [
  { id: 'code:modelPool.ts', world: 'code', risk: 0.6, impact: 0.8 },
  { id: 'runtime:p95_latency', world: 'runtime', risk: 0.3, impact: 0.9 },
  { id: 'user:login_wait', world: 'user', risk: 0.4, impact: 0.7 },
  { id: 'business:onboarding_conversion', world: 'business', risk: 0.5, impact: 0.85 }
];

const goalPresets: Record<string, GoalPreset> = {
  balanced: {
    label: 'Balanced delivery',
    impactWeight: 0.7,
    riskWeight: 0.3,
    confidenceThreshold: 0.65,
    description: 'General planning mode across impact and execution risk.'
  },
  growth: {
    label: 'Growth / expansion',
    impactWeight: 0.88,
    riskWeight: 0.12,
    confidenceThreshold: 0.58,
    description: 'Bias toward upside opportunities, tolerate more uncertainty.'
  },
  reliability: {
    label: 'Reliability / risk control',
    impactWeight: 0.52,
    riskWeight: 0.48,
    confidenceThreshold: 0.76,
    description: 'Bias toward safer bets and stronger evidence before action.'
  },
  adoption: {
    label: 'Adoption / onboarding',
    impactWeight: 0.78,
    riskWeight: 0.22,
    confidenceThreshold: 0.62,
    description: 'Optimize for user activation and first-value experiences.'
  }
};

export function App() {
  const [impactWeight, setImpactWeight] = useState(0.7);
  const [riskWeight, setRiskWeight] = useState(0.3);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.65);
  const [goalMode, setGoalMode] = useState<keyof typeof goalPresets>('balanced');
  const [zoom, setZoom] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
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

  const baseNodes = parsedNodes.length ? parsedNodes : fallbackNodes;

  const ranked = useMemo<RankedNode[]>(() => {
    return [...baseNodes]
      .map((n) => ({ ...n, score: n.impact * impactWeight - n.risk * riskWeight }))
      .filter((n) => n.score >= confidenceThreshold - 0.5)
      .sort((a, b) => b.score - a.score);
  }, [baseNodes, impactWeight, riskWeight, confidenceThreshold]);

  const worldOrder = ['code', 'runtime', 'user', 'business'];
  const worldX = new Map(worldOrder.map((w, i) => [w, 120 + i * 180]));
  const meshWidth = 760;
  const meshHeight = 420;

  const meshNodes = useMemo(() => {
    if (!ranked.length) return [];
    return ranked.map((n, idx) => {
      const x = worldX.get(n.world) ?? 120;
      const y = 70 + idx * ((meshHeight - 120) / Math.max(1, ranked.length - 1));
      const radius = 7 + Math.max(0, n.score) * 10;
      return { ...n, x, y, radius };
    });
  }, [ranked]);

  const meshLinks = useMemo(() => {
    if (meshNodes.length < 2) return [];
    const links: Array<{ from: typeof meshNodes[number]; to: typeof meshNodes[number] }> = [];
    for (let i = 0; i < meshNodes.length - 1; i += 1) {
      links.push({ from: meshNodes[i], to: meshNodes[i + 1] });
    }
    return links;
  }, [meshNodes]);

  const selectedNode = meshNodes.find((n) => n.id === selectedNodeId) ?? null;

  const applyGoalPreset = (key: keyof typeof goalPresets) => {
    const preset = goalPresets[key];
    setGoalMode(key);
    setImpactWeight(preset.impactWeight);
    setRiskWeight(preset.riskWeight);
    setConfidenceThreshold(preset.confidenceThreshold);
  };

  const zoomedWidth = meshWidth / zoom;
  const zoomedHeight = meshHeight / zoom;
  const zoomedX = (meshWidth - zoomedWidth) / 2;
  const zoomedY = (meshHeight - zoomedHeight) / 2;

  const onLoadJson = () => {
    try {
      const parsed = JSON.parse(rawJson) as WorkUnit;
      if (!parsed || !parsed.id) {
        setError('JSON does not look like a WorkUnit (missing id).');
        return;
      }
      setWorkUnit(parsed);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onLoadFromUrl = async () => {
    try {
      const parsed = (await loadJsonFromUrl(jsonUrl)) as WorkUnit;
      if (!parsed || !parsed.id) {
        setError('URL JSON does not look like a WorkUnit (missing id).');
        return;
      }
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
      if (!parsed || !parsed.id) {
        setError('File JSON does not look like a WorkUnit (missing id).');
        return;
      }
      setRawJson(JSON.stringify(parsed, null, 2));
      setWorkUnit(parsed);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      e.target.value = '';
    }
  };

  const onLoadSample = () => {
    setWorkUnit(sampleWorkUnit);
    setRawJson(JSON.stringify(sampleWorkUnit, null, 2));
    setError(null);
  };

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: 20 }}>
      <h1>Worldforge Instantiation Visualization</h1>
      <p>Calibration knobs + potential impact mesh view</p>

      <h2>Load WorkUnit JSON</h2>
      <p>Paste JSON, load from URL, or import local .json exported by the backend.</p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <input
          type='url'
          value={jsonUrl}
          onChange={(e) => setJsonUrl(e.target.value)}
          placeholder='https://.../workunit.json'
          style={{ flex: 1 }}
        />
        <button onClick={onLoadFromUrl} disabled={!jsonUrl.trim()}>Load from URL</button>
        <label style={{ border: '1px solid #ccc', padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}>
          Load file
          <input type='file' accept='application/json,.json' onChange={onLoadFromFile} style={{ display: 'none' }} />
        </label>
        <button onClick={onLoadSample}>Load sample</button>
      </div>

      <textarea
        value={rawJson}
        onChange={(e) => setRawJson(e.target.value)}
        placeholder='{"id":"wu_...","impactSurface":{"entities":[...]}}'
        style={{ width: '100%', minHeight: 140 }}
      />
      <div style={{ marginTop: 8 }}>
        <button onClick={onLoadJson}>Load WorkUnit</button>
      </div>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {workUnit && <p>Loaded WorkUnit: <b>{workUnit.id}</b>{workUnit.title ? ` — ${workUnit.title}` : ''}</p>}

      <div style={{ display: 'grid', gap: 10, maxWidth: 860, marginTop: 20 }}>
        <label>
          Business goal mode
          <select
            value={goalMode}
            onChange={(e) => applyGoalPreset(e.target.value as keyof typeof goalPresets)}
            style={{ marginLeft: 10 }}
          >
            {Object.entries(goalPresets).map(([key, preset]) => (
              <option key={key} value={key}>{preset.label}</option>
            ))}
          </select>
        </label>
        <p style={{ margin: 0, color: '#3b4a66' }}>{goalPresets[goalMode].description}</p>

        <label>
          Upside emphasis (impact weight): {impactWeight.toFixed(2)}
          <input type='range' min={0} max={1} step={0.01} value={impactWeight} onChange={(e) => setImpactWeight(Number(e.target.value))} />
        </label>
        <label>
          Execution risk sensitivity (risk weight): {riskWeight.toFixed(2)}
          <input type='range' min={0} max={1} step={0.01} value={riskWeight} onChange={(e) => setRiskWeight(Number(e.target.value))} />
        </label>
        <label>
          Evidence strictness (confidence threshold): {confidenceThreshold.toFixed(2)}
          <input type='range' min={0.4} max={0.95} step={0.01} value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(Number(e.target.value))} />
        </label>
      </div>

      <h2>Potential impact mesh (ranked entities)</h2>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <button onClick={() => setZoom((z) => Math.max(1, Number((z - 0.2).toFixed(2))))}>-</button>
        <span>Zoom: {zoom.toFixed(1)}x</span>
        <button onClick={() => setZoom((z) => Math.min(3, Number((z + 0.2).toFixed(2))))}>+</button>
        <input type='range' min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 180 }} />
        <span style={{ color: '#5a6a88' }}>Click a node to inspect details</span>
      </div>

      <svg
        viewBox={`${zoomedX} ${zoomedY} ${zoomedWidth} ${zoomedHeight}`}
        width='100%'
        style={{ maxWidth: 980, border: '1px solid #ddd', borderRadius: 10, background: '#fbfcff' }}
      >
        {worldOrder.map((w) => {
          const x = worldX.get(w) ?? 120;
          return (
            <g key={w}>
              <line x1={x} y1={30} x2={x} y2={meshHeight - 20} stroke='#e9edf5' strokeWidth={2} />
              <text x={x} y={20} textAnchor='middle' fontSize={12} fill='#3a4a6a'>{w}</text>
            </g>
          );
        })}

        {meshLinks.map((l, idx) => (
          <line
            key={`link_${idx}`}
            x1={l.from.x}
            y1={l.from.y}
            x2={l.to.x}
            y2={l.to.y}
            stroke='#9fb8ff'
            strokeWidth={1 + Math.max(0.4, l.from.score + 0.3)}
            opacity={0.7}
          />
        ))}

        {meshNodes.map((n) => {
          const selected = selectedNodeId === n.id;
          return (
            <g key={n.id} onClick={() => setSelectedNodeId(n.id)} style={{ cursor: 'pointer' }}>
              <circle
                cx={n.x}
                cy={n.y}
                r={selected ? n.radius + 2 : n.radius}
                fill={selected ? '#355ef5' : '#4f7cff'}
                fillOpacity={0.9}
                stroke={selected ? '#132f9c' : '#2447bf'}
                strokeWidth={selected ? 2 : 1.2}
              />
              <text x={n.x + 12} y={n.y + 4} fontSize={11} fill='#1f2a44'>
                {n.id.split('/').pop()} ({n.score.toFixed(2)})
              </text>
            </g>
          );
        })}
      </svg>

      {!meshNodes.length && <p>No entities passed the current calibration threshold.</p>}

      {selectedNode && (
        <div style={{ marginTop: 10, border: '1px solid #d5deef', borderRadius: 8, padding: 10, maxWidth: 980, background: '#f8faff' }}>
          <b>Node detail</b>
          <div>Entity: {selectedNode.id}</div>
          <div>World: {selectedNode.world}</div>
          <div>Impact signal: {selectedNode.impact.toFixed(3)}</div>
          <div>Risk signal: {selectedNode.risk.toFixed(3)}</div>
          <div>Composite score: {selectedNode.score.toFixed(3)}</div>
        </div>
      )}

      <ul>
        {ranked.map((n) => (
          <li key={n.id}>{n.id} | world={n.world} | score={n.score.toFixed(3)}</li>
        ))}
      </ul>
    </div>
  );
}
