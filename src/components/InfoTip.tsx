import { useState, useRef, useEffect } from 'react';

interface InfoTipData {
  logic: string;
  source: string;
  script: string;
}

export default function InfoTip({ data }: { data: InfoTipData }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show || !tipRef.current) return;
    const rect = tipRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      tipRef.current.style.left = 'auto';
      tipRef.current.style.right = '0';
    }
  }, [show]);

  return (
    <div ref={ref} style={{ display: 'inline-block', position: 'relative', marginLeft: 6, verticalAlign: 'middle' }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <svg width="14" height="14" viewBox="0 0 16 16" style={{ cursor: 'pointer', opacity: 0.35 }}>
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <text x="8" y="12" textAnchor="middle" fontSize="10" fill="currentColor" fontWeight="600">i</text>
      </svg>
      {show && (
        <div ref={tipRef} style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 9999,
          background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6, padding: '8px 12px', minWidth: 260, maxWidth: 380,
          fontSize: 11, lineHeight: 1.6, color: '#94a3b8', pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <div><span style={{ color: '#64748b' }}>逻辑：</span><span style={{ color: '#e2e8f0' }}>{data.logic}</span></div>
          <div><span style={{ color: '#64748b' }}>数据源：</span><span style={{ color: '#93c5fd', fontFamily: 'monospace', fontSize: 10 }}>{data.source}</span></div>
          <div><span style={{ color: '#64748b' }}>脚本：</span><span style={{ color: '#86efac', fontFamily: 'monospace', fontSize: 10 }}>{data.script}</span></div>
        </div>
      )}
    </div>
  );
}
