import React from 'react'

export default function MetricCard({label, value, hint}){
  return (
    <div className="metric-pill card">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {hint && <div style={{marginTop:6,fontSize:12,color:'var(--muted)'}}>{hint}</div>}
    </div>
  )
}
