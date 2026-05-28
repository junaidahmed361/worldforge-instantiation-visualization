import React, { useMemo, useState } from 'react';

const sampleNodes = [
  { id: 'code:modelPool.ts', world: 'code', risk: 0.6, impact: 0.8 },
  { id: 'runtime:p95_latency', world: 'runtime', risk: 0.3, impact: 0.9 },
  { id: 'user:login_wait', world: 'user', risk: 0.4, impact: 0.7 },
  { id: 'business:onboarding_conversion', world: 'business', risk: 0.5, impact: 0.85 }
];

export function App() {
  const [impactWeight, setImpactWeight] = useState(0.7);
  const [riskWeight, setRiskWeight] = useState(0.3);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.65);

  const ranked = useMemo(() => {
    return [...sampleNodes]
      .map((n) => ({ ...n, score: n.impact * impactWeight - n.risk * riskWeight }))
      .filter((n) => n.score >= confidenceThreshold - 0.5)
      .sort((a, b) => b.score - a.score);
  }, [impactWeight, riskWeight, confidenceThreshold]);

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', padding: 20 }}>
      <h1>Worldforge Instantiation Visualization</h1>
      <p>Calibration knobs + potential impact mesh view (MVP scaffold)</p>

      <div style={{ display: 'grid', gap: 10, maxWidth: 700 }}>
        <label>Impact weight: {impactWeight.toFixed(2)}
          <input type='range' min={0} max={1} step={0.01} value={impactWeight} onChange={(e) => setImpactWeight(Number(e.target.value))} />
        </label>
        <label>Risk weight: {riskWeight.toFixed(2)}
          <input type='range' min={0} max={1} step={0.01} value={riskWeight} onChange={(e) => setRiskWeight(Number(e.target.value))} />
        </label>
        <label>Confidence threshold: {confidenceThreshold.toFixed(2)}
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
