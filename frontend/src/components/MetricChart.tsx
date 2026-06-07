import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer
} from 'recharts'

interface Props {
  datapoints: number[]
  baseline: number
  primaryMetric: string
  minutesElapsed: number
  severity: string
}

export default function MetricChart({
  datapoints, baseline, primaryMetric, minutesElapsed, severity
}: Props) {
  const isSessionDuration = primaryMetric === 'session_duration_s'

  const prePoints = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      minute: -(30 - i),
      value: baseline + (Math.random() - 0.5) * baseline * 0.02,
      phase: 'pre'
    }))
  , [baseline, primaryMetric])

  const postPoints = datapoints.map((value, i) => ({
    minute: i + 1,
    value,
    phase: 'post'
  }))

  const allPoints = [...prePoints, ...postPoints]

  const formatValue = (val: number) =>
    isSessionDuration ? `${Math.round(val)}s` : `${(val * 100).toFixed(1)}%`

  const lineColor = severity === 'critical' ? '#dc2626'
    : severity === 'warning' ? '#d97706'
    : severity === 'watch' ? '#2563eb'
    : '#16a34a'

  return (
    <div className="metric-chart-card">
      <div className="chart-header">
        <span className="chart-title">
          {primaryMetric.replace(/_/g, ' ').replace(' s', '')}
        </span>
        <span className="chart-subtitle">
          baseline {formatValue(baseline)} · {minutesElapsed.toFixed(0)} min since deploy
        </span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={allPoints} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="minute"
            tick={{ fontSize: 9, fill: '#8e8e93', fontFamily: 'SF Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v === 0 ? 'deploy' : `${v}m`}
            interval={9}
          />
          <YAxis
            tick={{ fontSize: 9, fill: '#8e8e93', fontFamily: 'SF Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatValue}
            width={40}
            domain={['auto', 'auto']}
          />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              fontFamily: 'SF Mono, monospace',
              border: '0.5px solid #d2d2d7',
              borderRadius: 6,
              background: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
            }}
            formatter={(value) => [formatValue(Number(value)), 'value']}
            labelFormatter={(label) => label === 0 ? 'deploy' : `${label}m`}
          />
          <ReferenceLine
            x={0}
            stroke="#2563eb"
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{ value: 'deploy', position: 'top', fontSize: 9, fill: '#2563eb', fontFamily: 'SF Mono, monospace' }}
          />
          <ReferenceLine
            y={baseline}
            stroke="#8e8e93"
            strokeDasharray="2 4"
            strokeWidth={1}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: lineColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
