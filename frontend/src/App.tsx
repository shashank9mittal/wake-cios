import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "./services/api";
import MetricChart from "./components/MetricChart";
import ShimmerLoader from "./components/ShimmerLoader";
import PromptPulse from "./components/PromptPulse";
import ReplayEngine, { type ReplaySnapshot } from "./components/ReplayEngine";
import DemoPage from "./pages/DemoPage";
import type {
  DeployEvent,
  MetricsResponse,
  InvestigateResponse,
} from "./types";

const HIGHER_IS_WORSE = new Set(["cart_abandonment_rate"]);

const BADGE_ICONS: Record<string, string> = {
  code: "</> ",
  prompt: "✦ ",
  config: "⚙ ",
};

function App() {
  const [view, setView] = useState<"main" | "demo">(
    window.location.pathname === "/demo" ? "demo" : "main",
  );
  const [changes, setChanges] = useState<DeployEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [investigations, setInvestigations] = useState<
    Record<string, InvestigateResponse>
  >({});
  const [investigating, setInvestigating] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [signalLocked, setSignalLocked] = useState<Record<string, boolean>>({});
  const [config, setConfig] = useState<{ team: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "prompt">("all");
  const [investigateError, setInvestigateError] = useState<
    Record<string, string>
  >({});
  const [detectionMinutes, setDetectionMinutes] = useState<
    Record<string, number>
  >({});
  const [detectionSnapshot, setDetectionSnapshot] = useState<
    Record<string, ReplaySnapshot>
  >({});
  const [replayOpen, setReplayOpen] = useState(false);

  const pollingRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const selectedChange = changes.find((c) => c.id === selected) || null;

  // Poll changes every 5 seconds
  const fetchChanges = useCallback(async () => {
    const data = await api.get("/changes");
    setChanges(data);
  }, []);

  useEffect(() => {
    // Polling pattern: initial fetch + interval. setState inside is intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchChanges();
    api.get("/config").then(setConfig);
    const interval = setInterval(fetchChanges, 5000);
    return () => clearInterval(interval);
  }, [fetchChanges]);

  // Poll metrics for selected change every 5 seconds
  useEffect(() => {
    if (!selected) return;
    if (!selectedChange || !selectedChange.deployed_at) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMetrics(null);
      return;
    }

    let cancelled = false;

    const fetchMetrics = async () => {
      const data = await api.get(`/metrics/${selected}`);
      if (cancelled) return;
      setMetrics(data);
      if (data.signal_detected) {
        setSignalLocked((prev) => {
          if (!prev[selected!]) {
            setDetectionMinutes((dm) => ({
              ...dm,
              [selected!]: Math.round(data.minutes_elapsed),
            }));
            setDetectionSnapshot((prev) => {
              if (prev[selected!]) return prev; // already captured at detection — don't overwrite
              return {
                ...prev,
                [selected!]: {
                  datapoints: data.datapoints,
                  minutes: Math.round(data.minutes_elapsed),
                  z_score: data.z_score,
                  primary_metric: data.primary_metric,
                  baseline: data.primary_metric_baseline,
                },
              };
            });
          }
          return { ...prev, [selected!]: true };
        });
      }
      if (data.minutes_elapsed >= 60) {
        if (pollingRef.current[selected!]) {
          clearInterval(pollingRef.current[selected!]);
          delete pollingRef.current[selected!];
        }
      }
    };

    fetchMetrics();
    if (pollingRef.current[selected]) {
      clearInterval(pollingRef.current[selected]);
      delete pollingRef.current[selected];
    }
    const interval = setInterval(fetchMetrics, 5000);
    pollingRef.current[selected] = interval;
    return () => {
      cancelled = true;
      if (pollingRef.current[selected]) {
        clearInterval(pollingRef.current[selected]);
        delete pollingRef.current[selected];
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on primitive deployed_at, not the object (new ref every poll)
  }, [selected, selectedChange?.deployed_at]);

  const handleTrigger = async (id: string) => {
    setTriggering(id);
    await api.post(`/trigger/${id}`);
    await fetchChanges();
    setSelected(id);
    setMetrics(null);
    setSignalLocked((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTriggering(null);
  };

  const handleReset = async (id: string) => {
    if (pollingRef.current[id]) {
      clearInterval(pollingRef.current[id]);
      delete pollingRef.current[id];
    }
    await api.post(`/reset/${id}`);
    await fetchChanges();
    if (selected === id) {
      setSelected(null);
      setMetrics(null);
      setInvestigations((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setSignalLocked((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setInvestigateError((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      setDetectionMinutes((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      setDetectionSnapshot((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      setReplayOpen(false);
    }
  };

  const handleInvestigate = async () => {
    if (!selected || !metrics) return;
    setInvestigateError((prev) => {
      const n = { ...prev };
      delete n[selected];
      return n;
    });
    setInvestigating(selected);
    try {
      const statsToSend = {
        ...metrics,
        signal_detected: metrics.signal_detected || !!signalLocked[selected],
      };
      const data = await api.post("/investigate", {
        scenario_id: selected,
        stats: statsToSend,
      });
      if (
        !data ||
        data.detail ||
        !data.signal_detected ||
        data.plain_english === "Analysis unavailable"
      ) {
        setInvestigateError((prev) => ({
          ...prev,
          [selected]: "Investigation failed — click to retry",
        }));
        return;
      }
      setInvestigations((prev) => ({ ...prev, [selected]: data }));
      if (selected && pollingRef.current[selected]) {
        clearInterval(pollingRef.current[selected]);
        delete pollingRef.current[selected];
      }
    } catch {
      setInvestigateError((prev) => ({
        ...prev,
        [selected]: "Investigation failed — click to retry",
      }));
    } finally {
      setInvestigating(null);
    }
  };

  const investigation = selected ? investigations[selected] : null;
  const isSignalLocked = selected ? signalLocked[selected] : false;

  const getItemBorderColor = (change: DeployEvent) => {
    if (signalLocked[change.id]) return "#dc2626";
    if (change.deployed_at && change.severity === "none") return "#16a34a";
    if (selected === change.id) return "#e5e7eb";
    return "transparent";
  };

  if (view === "demo") {
    return (
      <div className="app">
        <div className="sidebar">
          <div className="sidebar-header">
            <div className="logo">
              <div className="logo-mark">W</div>
              <span>Wake</span>
            </div>
          </div>
          <div style={{ padding: "12px" }}>
            <button
              onClick={() => setView("main")}
              style={{
                width: "100%",
                padding: "8px",
                background: "#0071CE",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ← Back to Wake
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <DemoPage />
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-mark">W</div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1px" }}
            >
              <span>Wake</span>
              {config && (
                <div
                  style={{
                    fontSize: "10px",
                    fontFamily: "SF Mono, monospace",
                    color: "#8e8e93",
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: "140px",
                  }}
                >
                  {config.team}
                </div>
              )}
            </div>
          </div>
          <span className="monitoring-badge">● monitoring</span>
        </div>
        <div className="change-list">
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All changes
            </button>
            <button
              className={`sidebar-tab ${activeTab === "prompt" ? "active" : ""}`}
              onClick={() => setActiveTab("prompt")}
            >
              ◈ Prompt Pulse
            </button>
          </div>

          {activeTab === "all" ? (
            <>
              <div className="sidebar-section-label">Recent changes</div>
              {changes.map((change) => (
                <div
                  key={change.id}
                  className={`change-item ${selected === change.id ? "active" : ""} severity-${change.severity}`}
                  onClick={() => setSelected(change.id)}
                  style={{
                    borderLeft: `3px solid ${getItemBorderColor(change)}`,
                    paddingLeft: "12px",
                  }}
                >
                  <div className="change-item-left">
                    <div className="change-name">{change.name}</div>
                    <div className="change-meta">{change.service}</div>
                    {change.deployed_at && (
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 500,
                          marginTop: "3px",
                          color: signalLocked[change.id]
                            ? "#dc2626"
                            : "#16a34a",
                        }}
                      >
                        {signalLocked[change.id]
                          ? "⚠ Behavioral regression detected"
                          : "✓ Within normal variance"}
                      </div>
                    )}
                  </div>
                  <div className="change-item-right">
                    <span className={`severity-dot ${change.severity}`}></span>
                    <span className={`change-type-badge ${change.change_type}`}>
                      {BADGE_ICONS[change.change_type] ?? ""}
                      {change.change_type.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </>
          ) : (
            <PromptPulse
              changes={changes}
              selected={selected}
              onSelect={setSelected}
              investigations={investigations}
              signalLocked={signalLocked}
            />
          )}
        </div>
      </div>

      <div className="main">
        {!selectedChange ? (
          <div className="empty-state">
            <div className="empty-logo-mark">W</div>
            <h2 className="empty-title">Wake is monitoring</h2>
            <p className="empty-subtitle">
              {changes.filter((c) => c.deployed_at).length > 0
                ? `${changes.filter((c) => c.deployed_at).length} active deploy${changes.filter((c) => c.deployed_at).length > 1 ? "s" : ""} under observation`
                : `${changes.length} changes ready to monitor`}
            </p>
            <div className="empty-services">
              {[...new Set(changes.map((c) => c.service))].map((service) => (
                <span key={service} className="empty-service-tag">
                  {service}
                </span>
              ))}
            </div>
            <p className="empty-hint">
              Select a change from the sidebar to begin
            </p>
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

            {selectedChange.deployed_at && !metrics && <ShimmerLoader />}

            {metrics && metrics.all_metrics && (
              <>
                <div className="metrics-grid">
                  {Object.entries(metrics.all_metrics).map(([key, m]) => {
                    const isSessionDuration = key === "session_duration_s";
                    const isNegative = isSessionDuration
                      ? m.delta < 0
                      : HIGHER_IS_WORSE.has(key)
                        ? m.delta_pct > 0
                        : m.delta_pct < 0;
                    const isPositive = isSessionDuration
                      ? false
                      : HIGHER_IS_WORSE.has(key)
                        ? m.delta_pct < 0
                        : m.delta_pct > 0;
                    const displayValue = isSessionDuration
                      ? `${Math.round(m.current)}s`
                      : `${(m.current * 100).toFixed(1)}%`;
                    const displayDelta = isSessionDuration
                      ? `${m.delta > 0 ? "+" : ""}${Math.round(m.delta)}s from baseline`
                      : `${m.delta_pct > 0 ? "+" : ""}${m.delta_pct.toFixed(1)}% from baseline`;
                    const descriptions: Record<string, string> = {
                      checkout_initiation_rate:
                        "Sessions where users started the checkout flow",
                      cart_abandonment_rate:
                        "Users who left without completing their purchase",
                      session_duration_s:
                        "Average time a user spends per session on site",
                      payment_completion_rate:
                        "Customers who finished payment after starting checkout",
                    };
                    return (
                      <div
                        key={key}
                        className={`metric-card ${isNegative ? "negative" : ""} ${isPositive ? "positive" : ""}`}
                      >
                        <div className="metric-label">
                          {key
                            .replace(/_/g, " ")
                            .replace(" s", "")
                            .toUpperCase()}
                        </div>
                        <div className="metric-value">{displayValue}</div>
                        <div className="metric-delta">{displayDelta}</div>
                        <div className="metric-divider"></div>
                        <div className="metric-description">
                          {descriptions[key] || key}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {metrics.datapoints[metrics.primary_metric] &&
                  metrics.datapoints[metrics.primary_metric].length >= 1 && (
                    <MetricChart
                      datapoints={metrics.datapoints[metrics.primary_metric]}
                      baseline={metrics.primary_metric_baseline}
                      primaryMetric={metrics.primary_metric}
                      minutesElapsed={metrics.minutes_elapsed}
                      severity={metrics.severity}
                    />
                  )}

                <div className="signal-bar">
                  <div
                    className={`signal-status ${
                      isSignalLocked
                        ? "critical"
                        : metrics.signal_detected
                          ? metrics.severity
                          : "none"
                    }`}
                  >
                    <span className="signal-label">
                      {metrics.signal_detected || isSignalLocked
                        ? "⚠ Signal detected"
                        : "✓ Within normal variance"}
                    </span>
                    <span className="signal-details">
                      z-score {metrics.z_score} · confidence{" "}
                      {metrics.confidence}%
                    </span>
                  </div>
                  {(metrics.signal_detected || isSignalLocked) &&
                    !investigation &&
                    (investigating === selected ? (
                      <span style={{ fontSize: 13, color: "#6b7280" }}>
                        Investigating...
                      </span>
                    ) : (
                      <button
                        className="btn-primary"
                        onClick={handleInvestigate}
                      >
                        Investigate →
                      </button>
                    ))}
                </div>

                {selectedChange.deployed_at &&
                  !metrics?.signal_detected &&
                  !isSignalLocked &&
                  metrics && (
                    <div className="monitoring-status">
                      <div className="monitoring-dot"></div>
                      <span>
                        Wake is monitoring ·{" "}
                        {Math.round(metrics.minutes_elapsed)} min elapsed
                      </span>
                    </div>
                  )}

                {(metrics?.signal_detected || isSignalLocked) &&
                  !investigation &&
                  investigating !== selected && (
                    <div className="signal-prompt">
                      Behavioral regression detected. Click Investigate for root
                      cause analysis.
                    </div>
                  )}
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
                      {detectionMinutes[selected!] ??
                        Math.round(metrics?.minutes_elapsed ?? 0)}{" "}
                      min after deploy
                    </span>
                  </div>
                  <div className="observation-bullets">
                    {investigation.summary_bullets.map((bullet, i) => (
                      <div key={i} className="observation-bullet">
                        <span
                          className={`bullet-dot ${i === 2 ? "amber" : "red"}`}
                        ></span>
                        <span className="bullet-text">
                          {bullet
                            .split(/\*\*(.*?)\*\*/)
                            .map((part, i) =>
                              i % 2 === 1 ? (
                                <strong key={i}>{part}</strong>
                              ) : (
                                part
                              ),
                            )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {investigateError[selectedChange.id] &&
              investigating !== selectedChange.id && (
                <div className="signal-prompt" style={{ color: "#dc2626" }}>
                  {investigateError[selectedChange.id]}
                  <button
                    className="btn-primary"
                    style={{ marginLeft: 12 }}
                    onClick={handleInvestigate}
                  >
                    Retry →
                  </button>
                </div>
              )}

            {investigating === selected && (
              <div className="investigating-shimmer">
                <div className="investigating-header">
                  <div className="investigating-spinner"></div>
                  <span>Wake is analyzing the signal...</span>
                </div>
                <div className="shimmer-bar" style={{ height: "80px" }}></div>
                <div
                  className="shimmer-bar"
                  style={{ height: "60px", width: "80%" }}
                ></div>
                <div
                  className="shimmer-bar"
                  style={{ height: "40px", width: "60%" }}
                ></div>
              </div>
            )}

            {investigation &&
              investigation.signal_detected &&
              (() => {
                const revenueIsNegative =
                  investigation.revenue_impact_per_hour > 0;
                const revenueColor = investigation.signal_detected
                  ? "#dc2626"
                  : "#6b7280";
                const revenuePrefix = revenueIsNegative ? "−" : "";
                const revenueDisplay =
                  investigation.revenue_impact_per_hour === 0
                    ? "No revenue impact"
                    : `${revenuePrefix}$${Math.abs(
                        investigation.revenue_impact_per_hour,
                      ).toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}/hr`;
                return (
                  <div
                    className={`investigation-card ${investigation.severity}`}
                  >
                    {detectionSnapshot[selected!] &&
                      investigation.signal_detected && (
                        <button
                          onClick={() => setReplayOpen(true)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            background: "#053288",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            padding: "8px 16px",
                            fontSize: 12,
                            fontFamily: "'SF Mono', monospace",
                            fontWeight: 600,
                            cursor: "pointer",
                            letterSpacing: "0.5px",
                            marginBottom: 12,
                          }}
                        >
                          ▶ REPLAY DETECTION
                        </button>
                      )}
                    <div className="inv-header">
                      <div
                        className="inv-revenue"
                        style={{ color: revenueColor }}
                      >
                        {revenueDisplay}
                        {investigation.affected_users_count > 0 && (
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#dc2626",
                              fontWeight: 500,
                              marginTop: "6px",
                            }}
                          >
                            ~
                            {investigation.affected_users_count.toLocaleString()}{" "}
                            {selectedChange.affected_segment} users affected
                            this hour
                          </div>
                        )}
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
                            <span className="cause-evidence">
                              {cause.evidence}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
          </div>
        )}
      </div>
      {replayOpen &&
        detectionSnapshot[selected!] &&
        selectedChange &&
        investigation && (
          <ReplayEngine
            snapshot={detectionSnapshot[selected!]}
            scenario={selectedChange}
            investigation={investigation}
            onClose={() => setReplayOpen(false)}
          />
        )}
    </div>
  );
}

export default App;
