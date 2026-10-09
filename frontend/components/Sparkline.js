import React from 'react'

export default function Sparkline({
  data = [],
  width = 100,
  height = 24,
  color = '#6366f1',
  fill = true,
  strokeWidth = 2,
}) {
  if (!data || data.length < 2) {
    return <span style={{ width, height, display: 'inline-block', opacity: 0.2 }}>—</span>
  }

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min === 0 ? 1 : max - min

  // Padding inside the SVG
  const padY = 3
  const effH = height - padY * 2
  const stepX = width / (data.length - 1)

  const points = data.map((val, idx) => {
    const x = idx * stepX
    const y = height - padY - ((val - min) / range) * effH
    return [x, y]
  })

  const pathD = points.reduce((acc, [x, y], idx) => {
    return idx === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `${acc} L ${x.toFixed(1)} ${y.toFixed(1)}`
  }, '')

  const lastPoint = points[points.length - 1]
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`
  const gradId = `spark-grad-${Math.random().toString(36).substr(2, 6)}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible', verticalAlign: 'middle', display: 'inline-block' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      {fill && <path d={areaD} fill={`url(#${gradId})`} />}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastPoint && (
        <circle
          cx={lastPoint[0]}
          cy={lastPoint[1]}
          r={2.5}
          fill={color}
          style={{ filter: `drop-shadow(0 0 3px ${color})` }}
        />
      )}
    </svg>
  )
}
