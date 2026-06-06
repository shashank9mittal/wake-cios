import { useState, useEffect, useCallback } from "react";
import { api } from "./services/api";
import type {
  DeployEvent,
  MetricsResponse,
  InvestigateResponse,
} from "./types";

function App() {
  const [changes, setChanges] = useState<DeployEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [investigation, setInvestigation] =
    useState<InvestigateResponse | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);

  // Poll changes every 5 seconds
  const fetchChanges = useCallback(async () => {
    const data = await api.get("/changes");
    setChanges(data);
  }, []);

  useEffect(() => {
    fetchChanges();
    const interval = setInterval(fetchChanges, 5000);
    return () => clearInterval(interval);
  }, [fetchChanges]);

  // Poll metrics for selected change every 5 seconds
  useEffect(() => {
    if (!selected) return;
    const selectedChange = changes.find((c) => c.id === selected);
    if (!selectedChange || !selectedChange.deployed_at) return;

    const fetchMetrics = async () => {
      const data = await api.get(`/metrics/${selected}`);
      setMetrics(data);
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [selected, changes]);

  const handleTrigger = async (id: string) => {
    setTriggering(id);
    await api.post(`/trigger/${id}`);
    await fetchChanges();
    setSelected(id);
    setMetrics(null);
    setInvestigation(null);
    setTriggering(null);
  };

  const handleReset = async (id: string) => {
    await api.post(`/reset/${id}`);
    await fetchChanges();
    if (selected === id) {
      setSelected(null);
      setMetrics(null);
      setInvestigation(null);
    }
  };

  const handleInvestigate = async () => {
    if (!selected || !metrics) return;
    setInvestigating(true);
    const data = await api.post("/investigate", {
      scenario_id: selected,
      stats: metrics,
    });
    setInvestigation(data);
    setInvestigating(false);
  };

  const selectedChange = changes.find((c) => c.id === selected) || null;

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <span className="logo">Wake</span>
          <span className="monitoring-badge">● monitoring</span>
        </div>
        <div className="change-list">
          {changes.map((change) => (
            <div
              key={change.id}
              className={`change-item ${selected === change.id ? "active" : ""} severity-${change.severity}`}
              onClick={() => {
                setSelected(change.id);
                setInvestigation(null);
              }}
            >
              <div className="change-item-top">
                <span className="change-type-badge">{change.change_type}</span>
                <span className={`severity-dot ${change.severity}`}></span>
              </div>
              <div className="change-name">{change.name}</div>
              <div className="change-meta">
                {change.service} · {change.engineer}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="main">
        {!selectedChange ? (
          <div className="empty-state">
            <p>Select a change to investigate</p>
          </div>
        ) : (
          <div className="detail">
            <div className="detail-header">
              <div>
                <h1>{selectedChange.name}</h1>
                <p className="detail-meta">
                  {selectedChange.service} · {selectedChange.team} ·{" "}
                  {selectedChange.engineer}
                </p>
              </div>
              <div className="header-actions">
                {!selectedChange.deployed_at ? (
                  <button
                    className="btn-primary"
                    onClick={() => handleTrigger(selectedChange.id)}
                    disabled={triggering === selectedChange.id}
                  >
                    {triggering === selectedChange.id
                      ? "Triggering..."
                      : "Simulate Deploy"}
                  </button>
                ) : (
                  <button
                    className="btn-ghost"
                    onClick={() => handleReset(selectedChange.id)}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            <div className="artifact-box">
              <span className="artifact-label">change artifact</span>
              <p>{selectedChange.change_artifact}</p>
            </div>

            {metrics && (
              <>
                <div className="metrics-grid">
                  {Object.entries(metrics.all_metrics).map(([key, m]) => (
                    <div
                      key={key}
                      className={`metric-card ${Math.abs(m.delta_pct) > 1 ? (m.delta_pct < 0 ? "negative" : "positive") : ""}`}
                    >
                      <div className="metric-label">
                        {key.replace(/_/g, " ")}
                      </div>
                      <div className="metric-value">
                        {key === 'session_duration_s'
                          ? `${Math.round(m.current)}s`
                          : `${(m.current * 100).toFixed(1)}%`}
                      </div>
                      <div className="metric-delta">
                        {key === 'session_duration_s'
                          ? `${m.delta > 0 ? '+' : ''}${Math.round(m.delta)}s`
                          : `${m.delta_pct > 0 ? '+' : ''}${m.delta_pct.toFixed(1)}%`}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="signal-bar">
                  <div className={`signal-status ${metrics.severity}`}>
                    <span className="signal-label">
                      {metrics.signal_detected
                        ? "⚠ Signal detected"
                        : "✓ Within normal variance"}
                    </span>
                    <span className="signal-details">
                      z-score {metrics.z_score} · confidence{" "}
                      {metrics.confidence}%
                    </span>
                  </div>
                  {metrics.signal_detected && !investigation && (
                    investigating
                      ? <span style={{ fontSize: 13, color: '#6b7280' }}>Investigating...</span>
                      : <button className="btn-primary" onClick={handleInvestigate}>Investigate →</button>
                  )}
                </div>
              </>
            )}

            {investigation && (
              <div className={`investigation-card ${investigation.severity}`}>
                <div className="inv-header">
                  <div
                    className="inv-revenue"
                    style={{
                      color: investigation.severity === 'none'
                        ? '#6b7280'
                        : metrics.primary_metric_delta < 0
                        ? '#ef4444'
                        : '#22c55e'
                    }}
                  >
                    {investigation.severity === 'none'
                      ? 'No revenue impact'
                      : `${metrics.primary_metric_delta < 0 ? '−' : '+'}$${Math.abs(
                          investigation.revenue_impact_per_hour
                        ).toLocaleString('en-US', { maximumFractionDigits: 0 })}/hr`}
                  </div>
                  <div
                    className={`inv-severity-badge ${investigation.severity}`}
                  >
                    {investigation.severity.toUpperCase()}
                  </div>
                </div>
                <p className="inv-plain">{investigation.plain_english}</p>
                <div className="inv-recommendation">
                  <span className="rec-label">Recommendation</span>
                  <p>{investigation.recommendation}</p>
                </div>
                <div className="inv-causes">
                  {investigation.likely_causes.map((cause, i) => (
                    <div key={i} className="cause-row">
                      <div className="cause-bar-wrap">
                        <div
                          className="cause-bar"
                          style={{ width: `${cause.confidence_pct}%` }}
                        />
                      </div>
                      <div className="cause-content">
                        <span className="cause-pct">
                          {cause.confidence_pct}%
                        </span>
                        <span className="cause-name">{cause.cause}</span>
                        <span className="cause-evidence">{cause.evidence}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
