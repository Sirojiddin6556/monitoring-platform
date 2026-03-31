import React from 'react'

export default function ChartCard({title, children, right}){
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">{title}</div>
        {right && <div className="card-meta">{right}</div>}
      </div>
      <div className="card-body">
        {children}
      </div>
    </div>
  )
}
