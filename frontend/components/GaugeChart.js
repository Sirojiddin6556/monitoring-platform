import React from 'react'
import { motion } from 'framer-motion'

export default function GaugeChart({
  value = 0,
  max = 100,
  size = 130,
  strokeWidth = 9,
  label = '',
  sublabel = '',
  color = null,
  unit = '%',
}) {
  const clamped = Math.max(0, Math.min(value, max))
  const percentage = Math.round((clamped / (max || 1)) * 100)

  // Classical Enterprise Metric Colors
  const strokeColor = color || (percentage >= 90 ? '#ef4444' : percentage >= 75 ? '#f59e0b' : '#10b981')

  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  // 240-degree classical technical meter arc
  const arcLength = circumference * (240 / 360)
  const offset = arcLength - (arcLength * percentage) / 100

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <svg
        width={size}
        height={size * 0.82}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: 'visible' }}
      >
        {/* Background track (Clean dark slate) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(150 ${size / 2} ${size / 2})`}
        />

        {/* Active Arc (Strict solid color, no fuzzy blur) */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          initial={{ strokeDashoffset: arcLength }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          transform={`rotate(150 ${size / 2} ${size / 2})`}
        />
      </svg>

      {/* Center Value */}
      <div
        style={{
          position: 'absolute',
          top: '42%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{
          fontSize: size > 150 ? 24 : 18,
          fontWeight: 700,
          color: '#f8fafc',
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'var(--font-mono, monospace)',
          lineHeight: 1,
        }}>
          {unit === '%' ? `${percentage}%` : `${value}${unit}`}
        </div>
        {label && (
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {label}
          </div>
        )}
      </div>

      {sublabel && (
        <div style={{ fontSize: 10.5, color: '#64748b', marginTop: -6, fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
          {sublabel}
        </div>
      )}
    </div>
  )
}
