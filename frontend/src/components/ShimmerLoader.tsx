export default function ShimmerLoader() {
  return (
    <div className="shimmer-container">
      <div className="shimmer-grid">
        <div className="shimmer-card"></div>
        <div className="shimmer-card"></div>
        <div className="shimmer-card"></div>
        <div className="shimmer-card"></div>
      </div>
      <div className="shimmer-bar"></div>
      <div className="shimmer-chart"></div>
      <div className="shimmer-bar" style={{ width: '60%' }}></div>
    </div>
  )
}
