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

export function App() {
  const [impactWeight, setImpactWeight] = useState(0.7);
  const [riskWeight, setRiskWeight] = useState(0.3);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.65);
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

  const ranked = useMemo(() => {
    return [...baseNodes]
      .map((n) => ({ ...n, score: n.impact * impactWeight - n.risk * riskWeight }))
      .filter((n) => n.score >= confidenceThreshold - 0.5)
      .sort((a, b) => b.score - a.score);
  }, [baseNodes, impactWeight, riskWeight, confidenceThreshold]);

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

      <div style={{ display: 'grid', gap: 10, maxWidth: 700, marginTop: 20 }}>
        <label>
          Impact weight: {impactWeight.toFixed(2)}
          <input type='range' min={0} max={1} step={0.01} value={impactWeight} onChange={(e) => setImpactWeight(Number(e.target.value))} />
        </label>
        <label>
          Risk weight: {riskWeight.toFixed(2)}
          <input type='range' min={0} max={1} step={0.01} value={riskWeight} onChange={(e) => setRiskWeight(Number(e.target.value))} />
        </label>
        <label>
          Confidence threshold: {confidenceThreshold.toFixed(2)}
          <input type='range' min={0.4} max={0.95} step={0.01} value={confidenceThreshold} onChange={(e) => setConfidenceThreshold(Number(e.target.value))} />
        </label>
      </div>

      <h2>Potential impact mesh (ranked entities)</h2>
      <ul>
        {ranked.map((n) => (
          <li key={n.id}>{n.id} | world={n.world} | score={n.score.toFixed(3)}</li>
        ))}
      </ul>
    </div>
  );
}
