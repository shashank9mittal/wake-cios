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
  const [investigations, setInvestigations] =
    useState<Record<string, InvestigateResponse>>({});
  const [investigating, setInvestigating] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [signalLocked, setSignalLocked] =
    useState<Record<string, boolean>>({});

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
    if (!selectedChange || !selectedChange.deployed_at) {
      setMetrics(null);
      return;
    }

    const fetchMetrics = async () => {
      const data = await api.get(`/metrics/${selected}`);
      setMetrics(data);
      if (data.signal_detected) {
        setSignalLocked(prev => ({...prev, [selected!]: true}));
      }
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
    setTriggering(null);
  };

  const handleReset = async (id: string) => {
    await api.post(`/reset/${id}`);
    await fetchChanges();
    if (selected === id) {
      setSelected(null);
      setMetrics(null);
      setInvestigations(prev => {
        const next = {...prev};
        delete next[id];
        return next;
      });
      setSignalLocked(prev => {
        const next = {...prev};
        delete next[id];
        return next;
      });
    }
  };

  const handleInvestigate = async () => {
    if (!selected || !metrics) return;
    setInvestigating(true);
    const data = await api.post("/investigate", {
      scenario_id: selected,
      stats: metrics,
    });
    if (selected) {
      setInvestigations(prev => ({...prev, [selected]: data}));
    }
    setInvestigating(false);
  };

  const selectedChange = changes.find((c) => c.id === selected) || null;

  const investigation = selected ? investigations[selected] : null;
  const isSignalLocked = selected ? signalLocked[selected] : false;

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <span className="logo">Wake</span>
          <span className="monitoring-badge">● monitoring</span>
        </div>
        <div className="change-list">
          <div className="sidebar-section-label">Recent changes</div>
          {changes.map((change) => (
            <div
              key={change.id}
              className={`change-item ${selected === change.id ? "active" : ""} severity-${change.severity}`}
              onClick={() => {
                setSelected(change.id);
              }}
            >
              <div className="change-item-left">
                <div className="change-name">{change.name}</div>
                <div className="change-meta">{change.service}</div>
              </div>
              <div className="change-item-right">
                <span className={`severity-dot ${change.severity}`}></span>
                <span className={`change-type-badge ${change.change_type}`}>
                  {change.change_type.toUpperCase()}
                </span>
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
                  {Object.entries(metrics.all_metrics).map(([key, m]) => {
                    const isSessionDuration = key === 'session_duration_s'
                    const isNegative = isSessionDuration ? m.delta < 0 : m.delta_pct < 0
                    const isPositive = isSessionDuration ? m.delta > 0 : m.delta_pct > 0
                    const displayValue = isSessionDuration
                      ? `${Math.round(m.current)}s`
                      : `${(m.current * 100).toFixed(1)}%`
                    const displayDelta = isSessionDuration
                      ? `${m.delta > 0 ? '+' : ''}${Math.round(m.delta)}s from baseline`
                      : `${m.delta_pct > 0 ? '+' : ''}${m.delta_pct.toFixed(1)}% from baseline`
                    const descriptions: Record<string, string> = {
                      checkout_initiation_rate: 'Sessions where users started the checkout flow',
                      cart_abandonment_rate: 'Users who left without completing their purchase',
                      session_duration_s: 'Average time a user spends per session on site',
                      payment_completion_rate: 'Customers who finished payment after starting checkout',
                    }
                    return (
                      <div
                        key={key}
                        className={`metric-card ${isNegative ? 'negative' : ''} ${isPositive ? 'positive' : ''}`}
                      >
                        <div className="metric-label">
                          {key.replace(/_/g, ' ').replace(' s', '').toUpperCase()}
                        </div>
                        <div className="metric-value">{displayValue}</div>
                        <div className="metric-delta">{displayDelta}</div>
                        <div className="metric-divider"></div>
                        <div className="metric-description">
                          {descriptions[key] || key}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="signal-bar">
                  <div className={`signal-status ${
                    isSignalLocked
                      ? 'critical'
                      : metrics.signal_detected
                        ? metrics.severity
                        : metrics.z_score > 2.0
                          ? 'none'
                          : 'none'
                  }`}>
                    <span className="signal-label">
                      {metrics.signal_detected || isSignalLocked
                        ? "⚠ Signal detected"
                        : metrics.z_score > 2.0
                          ? "✓ Positive lift detected"
                          : "✓ Within normal variance"}
                    </span>
                    <span className="signal-details">
                      z-score {metrics.z_score} · confidence{" "}
                      {metrics.confidence}%
                    </span>
                  </div>
                  {(metrics.signal_detected || isSignalLocked) && !investigation && !investigating && (
                    investigating
                      ? <span style={{ fontSize: 13, color: '#6b7280' }}>Investigating...</span>
                      : <button className="btn-primary" onClick={handleInvestigate}>Investigate →</button>
                  )}
                </div>
              </>
            )}

            {investigation &&
             investigation.signal_detected &&
             investigation.summary_bullets &&
             investigation.summary_bullets.length > 0 && (
              <div className="observation-card">
                <div className="observation-header">
                  <span className="observation-label">Wake observation</span>
                  <span className="observation-time">
                    {metrics && Math.round(metrics.minutes_elapsed)} min after deploy
                  </span>
                </div>
                <div className="observation-bullets">
                  {investigation.summary_bullets.map((bullet, i) => (
                    <div key={i} className="observation-bullet">
                      <span className={`bullet-dot ${i === 2 ? 'amber' : 'red'}`}></span>
                      <span
                        className="bullet-text"
                        dangerouslySetInnerHTML={{
                          __html: bullet.replace(
                            /\*\*(.*?)\*\*/g,
                            '<strong>$1</strong>'
                          ),
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {investigation && investigation.signal_detected && (() => {
              const revenueIsNegative = metrics && metrics.primary_metric_delta < 0
              const revenueColor = investigation.severity === 'none'
                ? '#6b7280'
                : revenueIsNegative
                  ? '#dc2626'
                  : '#6b7280'
              const revenuePrefix = revenueIsNegative ? '−' : ''
              const revenueDisplay = investigation.revenue_impact_per_hour === 0
                ? 'No revenue impact'
                : `${revenuePrefix}$${Math.abs(investigation.revenue_impact_per_hour)
                    .toLocaleString('en-US', { maximumFractionDigits: 0 })}/hr`
              return (
              <div className={`investigation-card ${investigation.severity}`}>
                <div className="inv-header">
                  <div className="inv-revenue" style={{ color: revenueColor }}>
                    {revenueDisplay}
                  </div>
                  <div className={`inv-severity-badge ${investigation.severity}`}>
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
              )
            })()}

            {investigation && !investigation.signal_detected && (
              <div className="signal-bar">
                <div className="signal-status none">
                  <span className="signal-label">✓ Deploy looks clean</span>
                  <span className="signal-details">No behavioral regression detected</span>
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
