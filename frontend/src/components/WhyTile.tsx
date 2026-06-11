interface WhyTileProps {
  metrics: {
    z_score: number;
    confidence: number;
    minutes_elapsed: number;
    signal_detected: boolean;
    severity: string;
    primary_metric: string;
    primary_metric_baseline: number;
    primary_metric_delta: number;
  };
  signalLocked: boolean; // pass signalLocked[selected] from App
}

type State = "GATHERING" | "WITHIN_VARIANCE" | "REGRESSION" | "POSITIVE_DRIFT";

const PALETTE: Record<
  State,
  { border: string; bg: string; accent: string; eyebrow: string }
> = {
  GATHERING: {
    border: "#d6dce5",
    bg: "#f5f7fa",
    accent: "#475569",
    eyebrow: "#64748b",
  },
  WITHIN_VARIANCE: {
    border: "#bbe7c9",
    bg: "#f1faf4",
    accent: "#15803d",
    eyebrow: "#16a34a",
  },
  REGRESSION: {
    border: "#f4c2c2",
    bg: "#fdf2f2",
    accent: "#b91c1c",
    eyebrow: "#dc2626",
  },
  POSITIVE_DRIFT: {
    border: "#bcd6f5",
    bg: "#f1f6fd",
    accent: "#1d4ed8",
    eyebrow: "#2563eb",
  },
};

function WhyTile({ metrics, signalLocked }: WhyTileProps) {
  const {
    z_score,
    confidence,
    minutes_elapsed,
    signal_detected,
    primary_metric,
    primary_metric_baseline,
    primary_metric_delta,
  } = metrics;

  // Derived values
  const threshold = 2.0;
  const stddev =
    z_score !== 0 ? Math.abs(primary_metric_delta / z_score) : 0;
  const deltaPctOfBaseline =
    (primary_metric_delta / primary_metric_baseline) * 100;
  const wigglePctOfBaseline = (stddev / primary_metric_baseline) * 100;
  const absZ = Math.abs(z_score);
  const metricLabel = primary_metric.replace(/_/g, " ");

  // Pick exactly one state. Order matters: C, then D before B, then A.
  let state: State;
  if ((signal_detected || signalLocked) && primary_metric_delta < 0) {
    state = "REGRESSION";
  } else if (
    !signal_detected &&
    !signalLocked &&
    primary_metric_delta > 0 &&
    absZ >= 1.5
  ) {
    state = "POSITIVE_DRIFT";
  } else if (!signal_detected && !signalLocked && minutes_elapsed >= 8) {
    state = "WITHIN_VARIANCE";
  } else {
    // GATHERING — deployed but not enough signal yet
    state = "GATHERING";
  }

  const palette = PALETTE[state];
  const fired = state === "REGRESSION";
  const eyebrow = `WHY WAKE ${fired ? "FIRED" : "STAYED SILENT"}`;

  const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

  let icon: string;
  let verdict: string;
  let why: string;
  let math: string;
  let footnote: string | null = null;

  if (state === "GATHERING") {
    icon = "◐";
    verdict = "Still gathering — Wake needs sustained data before it judges.";
    why = `One data point is never enough. Wake watches for a consistent pattern over several minutes before it concludes anything. ${Math.round(
      minutes_elapsed,
    )} of ~8 minutes observed.`;
    math = `z-score ${z_score} · threshold ±2.0 · ramp incomplete`;
  } else if (state === "WITHIN_VARIANCE") {
    icon = "✓";
    verdict =
      "No action needed — this is normal day-to-day variation, not a regression.";
    why = `${metricLabel} moved ${signed(
      deltaPctOfBaseline,
    )}% — but this metric naturally swings about ±${wigglePctOfBaseline.toFixed(
      1,
    )}% hour to hour. This movement is well inside that normal range.`;
    math = `z-score ${z_score} · threshold ±2.0 · ${absZ.toFixed(
      2,
    )} of 2.0 → ${((absZ / 2) * 100).toFixed(
      0,
    )}% of the way to the line · confidence ${confidence}%`;
    footnote = "Firing here would be a false alarm. Wake stays silent.";
  } else if (state === "REGRESSION") {
    icon = "⚠";
    verdict = "Real regression — this crossed the line and needs attention.";
    why = `${metricLabel} dropped ${Math.abs(deltaPctOfBaseline).toFixed(
      1,
    )}%. Normal wiggle for this metric is only ±${wigglePctOfBaseline.toFixed(
      1,
    )}%, so this is ${absZ.toFixed(
      1,
    )} times the normal swing — and it has held for ${Math.round(
      minutes_elapsed,
    )} minutes, not a momentary blip.`;
    math = `z-score ${z_score} · threshold ±2.0 · EXCEEDED by ${(
      absZ - 2
    ).toFixed(2)} · confidence ${confidence}%`;
  } else {
    // POSITIVE_DRIFT
    icon = "↑";
    verdict = "Good news — this metric improved. No action needed.";
    why = `${metricLabel} moved UP ${deltaPctOfBaseline.toFixed(
      1,
    )}%. Wake notes the change but doesn't raise an alert, because nothing broke.`;
    math = `z-score ${z_score} (positive direction) · alerts fire only on sustained NEGATIVE deviation`;
  }

  // Silence threshold reference to keep it part of the engine contract.
  void threshold;

  return (
    <div
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        borderRadius: 10,
        padding: 18,
        marginBottom: 16,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
      }}
    >
      {/* Eyebrow */}
      <div
        style={{
          fontFamily: "'SF Mono', monospace",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "1px",
          textTransform: "uppercase",
          color: palette.eyebrow,
          marginBottom: 10,
        }}
      >
        {eyebrow}
      </div>

      {/* VP verdict */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          fontSize: 15.5,
          fontWeight: 700,
          lineHeight: 1.35,
          color: palette.accent,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1.3 }}>{icon}</span>
        <span>{verdict}</span>
      </div>

      {/* Manager why */}
      <p
        style={{
          fontSize: 13,
          fontWeight: 400,
          lineHeight: 1.55,
          color: "#1f2937",
          margin: "10px 0 0",
        }}
      >
        {why}
      </p>

      {footnote && (
        <p
          style={{
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.5,
            color: palette.accent,
            margin: "8px 0 0",
          }}
        >
          {footnote}
        </p>
      )}

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: palette.border,
          margin: "14px 0 10px",
        }}
      />

      {/* Developer math */}
      <div
        style={{
          fontFamily: "'SF Mono', monospace",
          fontSize: 11,
          color: "#6b7280",
          letterSpacing: "0.4px",
          lineHeight: 1.5,
        }}
      >
        {math}
      </div>
    </div>
  );
}

export default WhyTile;
