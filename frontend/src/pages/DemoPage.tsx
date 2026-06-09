import { useState, useEffect, useRef } from "react";

const BASE = "http://localhost:8000";

const COPY_V1 = "Great value. Highly rated. Ships free.";
const COPY_V2 =
  "Customers who bought this for game-day entertaining say it keeps drinks cold for 6+ hours without re-icing — and the wide mouth makes it easy to load up with ice and cans before guests arrive. 4.7 stars across 2,300+ reviews.";

interface DemoState {
  prompt_version: string;
  pr_merged?: boolean;
  pr_info?: string;
}

export default function DemoPage() {
  const [demoState, setDemoState] = useState<DemoState>({ prompt_version: "concise" });
  const [pollCount, setPollCount] = useState(0);
  const [flashing, setFlashing] = useState(false);
  const [showBanner, setShowBanner] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const prevVersionRef = useRef<string>("");

  const isV2 = demoState.prompt_version === "conversational";

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/demo-state`);
        const data: DemoState = await res.json();
        setPollCount((n) => n + 1);
        setDemoState(data);

        if (prevVersionRef.current !== "conversational" && data.prompt_version === "conversational") {
          // Version flipped
          setFlashing(true);
          setShowBanner(true);
          setShowComparison(true);
          setTimeout(() => setFlashing(false), 1800);
          setTimeout(() => setShowBanner(false), 8000);
        }
        prevVersionRef.current = data.prompt_version;
      } catch {
        // ignore poll errors
      }
    };

    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", background: "#f5f5f5", minHeight: "100vh", padding: "24px", paddingTop: showBanner ? 52 : 24, transition: "padding-top 0.3s ease" }}>

      {/* PR Merged banner */}
      {showBanner && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          background: "#0071CE", color: "#fff", textAlign: "center",
          padding: "12px", fontWeight: 700, fontSize: 15,
          animation: "slideDown 0.3s ease",
        }}>
          PR Merged — prompt updated to v2 · Conversational
        </div>
      )}

      <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", gap: 24 }}>

        {/* ── Product card ── */}
        <div style={{ flex: 1 }}>
          <div style={{
            background: flashing ? "#e6f3ff" : "#fff",
            border: flashing ? "2px solid #0071CE" : "2px solid #e0e0e0",
            borderRadius: 8, padding: 24,
            transition: "background 0.3s, border-color 0.3s",
          }}>

            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#333", textTransform: "uppercase", letterSpacing: 1 }}>
                AI Recommendations
              </span>
              {isV2 ? (
                <span style={{ background: "#e6f9ee", color: "#1a7a3c", border: "1px solid #1a7a3c", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                  v2 · Conversational
                </span>
              ) : (
                <span style={{ background: "#fff8e6", color: "#b36a00", border: "1px solid #FFC220", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                  v1 · Concise
                </span>
              )}
            </div>

            {/* Product image placeholder */}
            <div style={{
              background: "#f0f0f0", height: 180, borderRadius: 6, marginBottom: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#999", fontSize: 13,
            }}>
              📦 Igloo 22 Qt Marine Cooler
            </div>

            {/* Rollback badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ background: "#FFC220", color: "#333", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                ROLLBACK
              </span>
              <span style={{ fontSize: 11, color: "#c00", fontWeight: 600 }}>Was $34.97</span>
            </div>

            {/* Price */}
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0071CE", marginBottom: 4 }}>
              $24.97
            </div>

            {/* Star rating */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 16 }}>
              <span style={{ color: "#FFC220", fontSize: 16 }}>★★★★★</span>
              <span style={{ fontSize: 13, color: "#555" }}>4.7 (2,312)</span>
            </div>

            {/* Add to cart */}
            <button style={{
              background: "#0071CE", color: "#fff", border: "none",
              borderRadius: 4, padding: "10px 24px", fontSize: 15, fontWeight: 700,
              cursor: "pointer", width: "100%", marginBottom: 20,
            }}>
              Add to cart
            </button>

            {/* AI recommendation block */}
            <div style={{
              borderTop: "1px solid #e0e0e0", paddingTop: 14,
              transition: "all 0.4s ease",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Why customers love it
              </div>
              <p style={{
                fontSize: 14, color: "#333", lineHeight: 1.6, margin: 0,
                transition: "opacity 0.4s",
              }}>
                {isV2 ? COPY_V2 : COPY_V1}
              </p>
            </div>
          </div>

          {/* ── Before/After comparison strip ── */}
          {showComparison && (
            <div style={{
              marginTop: 16, background: "#fff", border: "1px solid #e0e0e0",
              borderRadius: 8, padding: 20,
              animation: "fadeIn 0.4s ease",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 12, textTransform: "uppercase", letterSpacing: 1 }}>
                Prompt Version Comparison
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div style={{ background: "#fff8e6", border: "1px solid #FFC220", borderRadius: 6, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#b36a00", marginBottom: 8 }}>v1 · Concise</div>
                  <p style={{ fontSize: 13, color: "#333", margin: 0, lineHeight: 1.5 }}>{COPY_V1}</p>
                </div>
                <div style={{ background: "#e6f9ee", border: "1px solid #1a7a3c", borderRadius: 6, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1a7a3c", marginBottom: 8 }}>v2 · Conversational</div>
                  <p style={{ fontSize: 13, color: "#333", margin: 0, lineHeight: 1.5 }}>{COPY_V2}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Status strip ── */}
        <div style={{
          width: 220, flexShrink: 0,
          position: "sticky", top: 24, alignSelf: "flex-start",
          background: "#1a1a1a", color: "#e0e0e0", borderRadius: 8, padding: 16,
          fontFamily: "monospace", fontSize: 12,
        }}>
          <div style={{ color: "#FFC220", fontWeight: 700, marginBottom: 12, fontSize: 13 }}>
            ⬡ WAKE · DEMO STATUS
          </div>
          <StatusRow label="polls" value={String(pollCount)} />
          <StatusRow
            label="prompt_version"
            value={demoState.prompt_version}
            highlight={isV2 ? "#4ade80" : "#facc15"}
          />
          {demoState.pr_merged !== undefined && (
            <StatusRow
              label="pr_merged"
              value={demoState.pr_merged ? "true" : "false"}
              highlight={demoState.pr_merged ? "#4ade80" : "#e0e0e0"}
            />
          )}
          {demoState.pr_info && (
            <StatusRow label="pr_info" value={demoState.pr_info} />
          )}
          <div style={{ marginTop: 12, borderTop: "1px solid #333", paddingTop: 10, color: "#666", fontSize: 11 }}>
            polling /demo-state every 3s
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to   { transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function StatusRow({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, gap: 8 }}>
      <span style={{ color: "#888" }}>{label}</span>
      <span style={{ color: highlight ?? "#e0e0e0", fontWeight: highlight ? 700 : 400, textAlign: "right", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}
