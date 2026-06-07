import type { DeployEvent, MetricsResponse, InvestigateResponse } from '../types'

interface Props {
  changes: DeployEvent[]
  selected: string | null
  onSelect: (id: string) => void
  investigations: Record<string, InvestigateResponse>
  signalLocked: Record<string, boolean>
}

export default function PromptPulse({
  changes, selected, onSelect, investigations, signalLocked
}: Props) {

  const promptChanges = changes.filter(c => c.change_type === 'prompt')

  if (promptChanges.length === 0) {
    return (
      <div className="prompt-empty">
        <div className="prompt-empty-icon">◈</div>
        <p className="prompt-empty-title">No prompt changes monitored</p>
        <p className="prompt-empty-sub">
          AI prompt changes will appear here when deployed
        </p>
      </div>
    )
  }

  return (
    <div className="prompt-pulse-list">
      <div className="prompt-pulse-header">
        <div className="prompt-pulse-badge">
          <span className="prompt-pulse-dot"></span>
          Prompt Pulse
        </div>
        <span className="prompt-pulse-sub">
          Monitoring {promptChanges.length} AI prompt change{promptChanges.length > 1 ? 's' : ''}
        </span>
      </div>

      {promptChanges.map(change => {
        const inv = investigations[change.id]
        const locked = signalLocked[change.id]
        const hasSignal = locked || change.severity === 'critical' || change.severity === 'warning'

        return (
          <div
            key={change.id}
            className={`change-item ${selected === change.id ? 'active' : ''} severity-${change.severity}`}
            onClick={() => onSelect(change.id)}
          >
            <div className="change-item-left">
              <div className="prompt-change-label">
                <span className="prompt-icon">◈</span>
                <span className="change-name">{change.name}</span>
              </div>
              <div className="change-meta">{change.service} · {change.engineer}</div>
              {hasSignal && inv && (
                <div className="prompt-signal-preview">
                  ⚠ Behavioral regression detected
                </div>
              )}
            </div>
            <div className="change-item-right">
              <span className={`severity-dot ${change.severity}`}></span>
              <span className="change-type-badge prompt">PROMPT</span>
            </div>
          </div>
        )
      })}

      <div className="prompt-explainer">
        <p>
          Wake monitors AI prompt changes the same way it monitors
          code deploys — detecting behavioral regressions within minutes.
        </p>
        <p>
          No other observability tool watches prompt changes.
        </p>
      </div>
    </div>
  )
}
