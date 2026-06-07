export interface DeployEvent {
  id: string
  name: string
  service: string
  engineer: string
  team: string
  surface: string
  change_type: 'code' | 'prompt' | 'config'
  change_artifact: string
  primary_metric: string
  deployed_at: string | null
  outcome: string
  affected_segment: string
  status: string
  severity: 'none' | 'watch' | 'warning' | 'critical'
}

export interface MetricsResponse {
  scenario_id: string
  minutes_elapsed: number
  signal_detected: boolean
  z_score: number
  severity: 'none' | 'watch' | 'warning' | 'critical'
  confidence: number
  primary_metric: string
  primary_metric_baseline: number
  primary_metric_current: number
  primary_metric_delta: number
  all_metrics: Record<string, {
    baseline: number
    current: number
    delta: number
    delta_pct: number
  }>
  datapoints: Record<string, number[]>
}

export interface InvestigateResponse {
  signal_detected: boolean
  confidence: number
  affected_segment: string
  likely_causes: Array<{
    cause: string
    evidence: string
    confidence_pct: number
  }>
  plain_english: string
  revenue_impact_per_hour: number
  recommendation: string
  severity: string
  summary_bullets: string[]
}
