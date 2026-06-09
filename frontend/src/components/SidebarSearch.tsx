const SidebarSearch = ({ value, onChange }: { value: string; onChange: (val: string) => void }) => (
  <div style={{
    padding: '0 12px 8px',
    position: 'relative',
  }}>
    <span style={{
      position: 'absolute', left: 20, top: '50%',
      transform: 'translateY(-50%)',
      color: '#8e8e93', fontSize: 13, pointerEvents: 'none',
    }}>⌕</span>
    <input
      type="text"
      placeholder="Search changes..."
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '7px 10px 7px 28px',
        background: '#f5f5f7',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        fontSize: 12,
        color: '#1d1d1f',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  </div>
)

export default SidebarSearch
