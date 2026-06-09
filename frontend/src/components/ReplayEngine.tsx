import { useState, useEffect, useRef } from 'react'
import MetricChart from './MetricChart'
import type { DeployEvent, InvestigateResponse } from '../types'

export interface ReplaySnapshot {
  datapoints: Record<string, number[]>
  minutes: number
  z_score: number
  primary_metric: string
  baseline: number
}

interface Props {
  snapshot: ReplaySnapshot
  scenario: DeployEvent
  investigation: InvestigateResponse
  onClose: () => void
}

export default function ReplayEngine({ snapshot, scenario, investigation, onClose }: Props) {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [signalFired, setSignalFired] = useState(false)
  const [revenue, setRevenue] = useState(0)
  const [showInvestigation, setShowInvestigation] = useState(false)
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const revenueRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearAll = () => {
    if (playRef.current) clearInterval(playRef.current)
    if (revenueRef.current) clearInterval(revenueRef.current)
  }

  const reset = () => {
    clearAll()
    setFrame(0)
    setPlaying(false)
    setSignalFired(false)
    setRevenue(0)
    setShowInvestigation(false)
  }

  const play = (fromFrame = frame) => {
    if (fromFrame >= snapshot.minutes) {
      reset()
      setTimeout(() => play(0), 50)
      return
    }
    setPlaying(true)
    let f = fromFrame
    playRef.current = setInterval(() => {
      f += 1
      setFrame(f)
      if (f >= snapshot.minutes) {
        clearInterval(playRef.current!)
        setPlaying(false)
      }
    }, 400)
  }

  const pause = () => {
    setPlaying(false)
    if (playRef.current) clearInterval(playRef.current)
  }

  // Auto-play on mount after short delay
  useEffect(() => {
    const t = setTimeout(() => play(0), 600)
    return () => { clearTimeout(t); clearAll() }
  }, [])

  // Signal fire + revenue counter
  useEffect(() => {
    if (frame >= snapshot.minutes && !signalFired) {
      setSignalFired(true)
      const target = investigation.revenue_impact_per_hour
      let current = 0
      const step = target / 80
      revenueRef.current = setInterval(() => {
        current += step
        if (current >= target) {
          setRevenue(target)
          clearInterval(revenueRef.current!)
          // Show investigation summary after revenue counter finishes
          setTimeout(() => setShowInvestigation(true), 400)
        } else {
          setRevenue(Math.round(current))
        }
      }, 20)
    }
    // Hide investigation if scrubbed back before signal
    if (frame < snapshot.minutes && signalFired) {
      setSignalFired(false)
      setRevenue(0)
      setShowInvestigation(false)
      if (revenueRef.current) clearInterval(revenueRef.current)
    }
  }, [frame])

  useEffect(() => () => clearAll(), [])

  // Derived values
  const currentDatapoints = snapshot.datapoints[snapshot.primary_metric].slice(0, Math.max(1, frame))
  const progress = frame / snapshot.minutes
  const replayZ = frame === 0
    ? 0
    : snapshot.z_score * Math.min(progress * 1.2, 1) + Math.sin(frame * 1.9) * 0.06
  const statusQuoLoss = Math.round(investigation.revenue_impact_per_hour * 24 * 6)
  const confidence = Math.min(Math.round(Math.abs(replayZ) / 3 * 99), 99)

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.modal}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <div style={S.eyebrow}>▶ WAKE DETECTION REPLAY</div>
            <div style={S.title}>{scenario.name}</div>
            <div style={S.meta}>{scenario.service} · {scenario.engineer} · {scenario.change_type.toUpperCase()}</div>
          </div>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Chart */}
        <div style={S.chartSection}>
          {snapshot.baseline != null && snapshot.baseline > 0 ? (
            <MetricChart
              datapoints={currentDatapoints}
              primaryMetric={snapshot.primary_metric}
              baseline={snapshot.baseline}
              minutesElapsed={frame}
              severity={signalFired ? 'critical' : Math.abs(replayZ) > 1.5 ? 'watch' : 'none'}
            />
          ) : null}
        </div>

        {/* Timeline scrubber */}
        <div style={S.timelineRow}>
          <button
            style={{ ...S.playBtn, background: playing ? '#6b7280' : '#053288' }}
            onClick={() => playing ? pause() : play()}
          >
            {playing ? '⏸' : frame >= snapshot.minutes ? '↺' : '▶'}
          </button>
          <div style={S.scrubberWrap}>
            <input
              type="range"
              min={0}
              max={snapshot.minutes}
              value={frame}
              onChange={e => {
                pause()
                setFrame(Number(e.target.value))
              }}
              style={S.scrubber}
            />
            {/* Tick marks for each minute */}
            <div style={S.ticks}>
              {Array.from({ length: snapshot.minutes + 1 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    ...S.tick,
                    left: `${(i / snapshot.minutes) * 100}%`,
                    background: i === snapshot.minutes ? '#dc2626' : '#d1d5db'
                  }}
                />
              ))}
            </div>
          </div>
          <div style={S.frameLabel}>
            {signalFired
              ? <span style={{ color: '#dc2626', fontWeight: 700 }}>⚠ MIN {snapshot.minutes} — SIGNAL</span>
              : `${frame} / ${snapshot.minutes} min`}
          </div>
        </div>

        {/* Stats row */}
        <div style={S.statsRow}>
          <div style={S.statBox}>
            <div style={S.statLabel}>Z-SCORE</div>
            <div style={{ ...S.statValue, color: signalFired ? '#dc2626' : Math.abs(replayZ) > 1.5 ? '#d97706' : '#1d1d1f' }}>
              {frame === 0 ? '0.00' : replayZ.toFixed(2)}
            </div>
          </div>
          <div style={S.statBox}>
            <div style={S.statLabel}>THRESHOLD</div>
            <div style={S.statValue}>±2.00</div>
          </div>
          <div style={S.statBox}>
            <div style={S.statLabel}>CONFIDENCE</div>
            <div style={{ ...S.statValue, color: signalFired ? '#dc2626' : '#1d1d1f' }}>
              {frame === 0 ? '0%' : `${confidence}%`}
            </div>
          </div>
          <div style={{ ...S.statBox, flex: 2 }}>
            <div style={S.statLabel}>STATUS</div>
            <div style={{
              ...S.statValue, fontSize: 13, fontWeight: 700,
              color: signalFired ? '#dc2626' : '#16a34a',
              transition: 'color 0.3s'
            }}>
              {signalFired ? '⚠ BEHAVIORAL REGRESSION DETECTED' : '✓ WITHIN NORMAL VARIANCE'}
            </div>
          </div>
        </div>

        {/* Investigation summary (fades in after revenue counter) */}
        {showInvestigation && (
          <div style={{ ...S.investigationBox, animation: 'fadeIn 0.4s ease-in' }}>
            <div style={S.invLabel}>WAKE OBSERVATION · {snapshot.minutes} MIN AFTER DEPLOY</div>
            {investigation.summary_bullets?.slice(0, 2).map((b, i) => (
              <div key={i} style={S.bullet}>
                <span style={S.bulletDot}>•</span>
                <span>
                  {b.split(/\*\*(.*?)\*\*/).map((part, i) =>
                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Split: Wake vs Status Quo */}
        <div style={S.split}>
          <div style={S.splitWake}>
            <div style={{ ...S.splitEyebrow, color: '#053288' }}>WAKE</div>
            <div style={S.splitHeadline}>Detected in {snapshot.minutes} minutes</div>
            <div style={S.splitRevenue}>
              –${signalFired ? investigation.revenue_impact_per_hour.toLocaleString() : '—'}/hr
            </div>
            {investigation.affected_users_count > 0 && (
              <div style={S.splitSub}>
                ~{investigation.affected_users_count.toLocaleString()} {scenario.affected_segment} users
              </div>
            )}
          </div>
          <div style={S.splitDivider}>
            <div style={S.vsLabel}>VS</div>
          </div>
          <div style={S.splitStatusQuo}>
            <div style={{ ...S.splitEyebrow, color: '#9ca3af' }}>STATUS QUO</div>
            <div style={{ ...S.splitHeadline, color: '#6b7280' }}>Found in Thursday business review</div>
            <div style={{ ...S.splitRevenue, color: '#9ca3af' }}>
              –${statusQuoLoss.toLocaleString()} total
            </div>
            <div style={{ ...S.splitSub, color: '#9ca3af' }}>
              6 days × 24 hrs × $340K/hr avg
            </div>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(6px)',
    padding: 20,
  },
  modal: {
    background: '#ffffff',
    borderRadius: 20,
    width: '100%', maxWidth: 900,
    maxHeight: '92vh',
    overflowY: 'auto',
    padding: '32px 36px',
    display: 'flex', flexDirection: 'column', gap: 20,
    boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  eyebrow: {
    fontSize: 10, fontFamily: "'SF Mono', 'JetBrains Mono', monospace",
    color: '#8e8e93', letterSpacing: '1.5px', marginBottom: 6,
  },
  title: {
    fontSize: 20, fontWeight: 700, color: '#1d1d1f', letterSpacing: '-0.3px',
  },
  meta: {
    fontSize: 12, fontFamily: "'SF Mono', monospace", color: '#8e8e93', marginTop: 4,
  },
  closeBtn: {
    background: '#f5f5f7', border: 'none', width: 32, height: 32,
    borderRadius: '50%', cursor: 'pointer', fontSize: 14, color: '#6b7280',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  chartSection: {
    height: 220,
    background: '#fafafa', borderRadius: 12, overflow: 'hidden', padding: '8px 0',
  },
  timelineRow: {
    display: 'flex', alignItems: 'center', gap: 14,
  },
  playBtn: {
    width: 40, height: 40, borderRadius: '50%',
    color: '#fff', border: 'none', cursor: 'pointer',
    fontSize: 15, flexShrink: 0, transition: 'background 0.2s',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  scrubberWrap: {
    flex: 1, position: 'relative',
  },
  scrubber: {
    width: '100%', accentColor: '#053288', height: 4, cursor: 'pointer',
  },
  ticks: {
    position: 'absolute', top: -6, left: 0, right: 0,
    height: 4, pointerEvents: 'none',
  },
  tick: {
    position: 'absolute', width: 1, height: 6, top: 0, transform: 'translateX(-50%)',
  },
  frameLabel: {
    fontSize: 11, fontFamily: "'SF Mono', monospace",
    color: '#1d1d1f', minWidth: 160, textAlign: 'right',
    fontWeight: 600,
  },
  statsRow: {
    display: 'flex', gap: 12,
  },
  statBox: {
    flex: 1, background: '#f5f5f7', borderRadius: 10, padding: '12px 16px',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  statLabel: {
    fontSize: 9, fontFamily: "'SF Mono', monospace",
    color: '#8e8e93', letterSpacing: '0.8px',
  },
  statValue: {
    fontSize: 22, fontWeight: 700,
    fontFamily: "'SF Mono', 'JetBrains Mono', monospace",
    color: '#1d1d1f', letterSpacing: '-0.5px',
  },
  investigationBox: {
    background: '#fef9ec', border: '1px solid #fde68a',
    borderRadius: 10, padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  invLabel: {
    fontSize: 9, fontFamily: "'SF Mono', monospace",
    color: '#92400e', letterSpacing: '0.8px', marginBottom: 4,
  },
  bullet: {
    fontSize: 13, color: '#1d1d1f', display: 'flex', gap: 8,
  },
  bulletDot: {
    color: '#d97706', flexShrink: 0, marginTop: 1,
  },
  split: {
    display: 'flex', borderRadius: 14,
    border: '1px solid #e5e7eb', overflow: 'hidden',
  },
  splitWake: {
    flex: 1, padding: '24px 28px',
    background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  splitStatusQuo: {
    flex: 1, padding: '24px 28px',
    background: '#f9fafb',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  splitDivider: {
    width: 48, background: '#f3f4f6',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  vsLabel: {
    fontSize: 11, fontFamily: "'SF Mono', monospace",
    color: '#9ca3af', fontWeight: 700, letterSpacing: '1px',
  },
  splitEyebrow: {
    fontSize: 9, fontFamily: "'SF Mono', monospace",
    letterSpacing: '1px', fontWeight: 700,
  },
  splitHeadline: {
    fontSize: 14, fontWeight: 600, color: '#1d1d1f',
  },
  splitRevenue: {
    fontSize: 28, fontWeight: 800, color: '#dc2626',
    fontFamily: "'SF Mono', monospace", letterSpacing: '-1px',
  },
  splitSub: {
    fontSize: 11, color: '#6b7280',
  },
}
