import React from 'react'
import { motion } from 'framer-motion'

export default function GaugeChart({
  value = 0,
  max = 100,
  size = 140,
  strokeWidth = 12,
  label = '',
  sublabel = '',
  color = null,
  unit = '%',
}) {
  const clamped = Math.max(0, Math.min(value, max))
  const percentage = Math.round((clamped / (max || 1)) * 100)

  // Color selection based on load
  const strokeColor = color || (percentage >= 90 ? '#f43f5e' : percentage >= 75 ? '#f59e0b' : '#22c55e')

  const radius = (size - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  // Semicircle arc (180 deg) or 240 deg arc
  // Let's make an elegant 240 deg arc (from -210 deg to 30 deg)
  const arcLength = circumference * (240 / 360)
  const offset = arcLength - (arcLength * percentage) / 100

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      <svg
        width={size}
        height={size * 0.85}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`gauge-grad-${percentage}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.6" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="1" />
          </linearGradient>
          <filter id={`gauge-glow-${percentage}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={strokeColor} floodOpacity="0.4" />
          </filter>
        </defs>

        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.07)"
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(150 ${size / 2} ${size / 2})`}
        />

        {/* Animated Active Arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#gauge-grad-${percentage})`}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          initial={{ strokeDashoffset: arcLength }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          transform={`rotate(150 ${size / 2} ${size / 2})`}
          style={{ filter: `url(#gauge-glow-${percentage})` }}
        />
      </svg>

      {/* Central Metric Value */}
      <div
        style={{
          position: 'absolute',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontSize: size > 160 ? 26 : 20, fontWeight: 800, color: '#e2e4f0', letterSpacing: '-0.02em', lineHeight: 1 }}>
          {unit === '%' ? `${percentage}%` : `${value}${unit}`}
        </div>
        {label && (
          <div style={{ fontSize: 11, color: '#8892a8', marginTop: 3, fontWeight: 500 }}>
            {label}
          </div>
        )}
      </div>

      {sublabel && (
        <div style={{ fontSize: 11, color: '#6272a4', marginTop: -4, fontWeight: 500 }}>
          {sublabel}
        </div>
      )}
    </div>
  )
}
