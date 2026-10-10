import {useEffect, useState, useMemo, useRef, useCallback} from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LineChart, Line, BarChart, Bar, Legend } from 'recharts'
import TimeRangeFilter from '../components/TimeRangeFilter'
import apiFetch from '../lib/api'
import {
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Sliders,
  Power,
  Boxes,
  ShieldCheck,
  FileText,
  Server,
  Database,
  Radio,
  Lock,
  Search,
  Plus,
  RefreshCw,
  Clock,
  Terminal,
  ArrowUpRight,
  ExternalLink,
  ChevronRight,
  Maximize2,
  Minimize2,
  BarChart2,
  TrendingUp,
  Grid,
  Layers,
  Sparkles,
  Filter,
  Check,
  Eye,
  EyeOff,
  LayoutGrid
} from 'lucide-react'


function StatusBadge({status}){
  const colors = {ok:'#4ade80', degraded:'#facc15', down:'#ef4444', unknown:'#9aa4b2', active:'#4ade80', inactive:'#ef4444', failed:'#ef4444', running:'#4ade80', exited:'#ef4444', paused:'#facc15'}
  const labels = {ok:'Online', degraded:'Degraded', down:'Offline', unknown:'N/A', active:'Active', inactive:'Stopped', failed:'Failed', running:'Running', exited:'Exited', paused:'Paused'}
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:colors[status]||colors.unknown}}/>
      <span style={{fontSize:11,color:colors[status]||colors.unknown,fontWeight:600}}>{labels[status]||status}</span>
    </span>
  )
}

function GaugeRing({value, max=100, color='#2563eb', label, unit='%', size=80}) {
  const numVal = typeof value === 'number' ? value : Number(value) || 0
  const pct = Math.min(Math.max(numVal / max * 100, 0), 100)
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (pct / 100) * circ
  const warn = pct > 80 ? '#ef4444' : pct > 60 ? '#facc15' : color
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,position:'relative'}}>
      <div style={{position:'relative',width:size,height:size}}>
        <svg width={size} height={size} style={{transform:'rotate(-90deg)'}}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={6}/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={warn} strokeWidth={6}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{transition:'stroke-dashoffset 0.6s ease, stroke 0.3s'}}/>
        </svg>
        <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center'}}>
          <div style={{fontSize:size>70?16:13,fontWeight:700,color:'#fff',lineHeight:1.1}}>
            {typeof value==='number'?value.toFixed(value<10 && value%1!==0 ?1:0):value}
          </div>
          {unit && <div style={{fontSize:9,color:'#94a3b8',marginTop:1}}>{unit}</div>}
        </div>
      </div>
      <div style={{fontSize:11,fontWeight:600,color:'#cbd5e1'}}>{label}</div>
    </div>
  )
}

function MiniChart({data, dataKey, color='#2563eb', height=60}) {
  if(!data||data.length<2) return <div style={{height,display:'flex',alignItems:'center',justifyContent:'center',color:'#9aa4b2',fontSize:11}}>—</div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{top:4,right:4,left:4,bottom:4}}>
        <defs>
          <linearGradient id={`mg-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4}/>
            <stop offset="100%" stopColor={color} stopOpacity={0.02}/>
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#mg-${dataKey})`} isAnimationActive={false} dot={false}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

function getSeriesStats(data, key) {
  if (!data || !data.length) return null
  let min = Infinity, max = -Infinity, sum = 0, count = 0, last = null
  for (let i = 0; i < data.length; i++) {
    const v = data[i][key]
    if (typeof v === 'number' && !isNaN(v)) {
      if (v < min) min = v
      if (v > max) max = v
      sum += v
      count++
      last = v
    }
  }
  if (count === 0) return null
  return { last, avg: sum / count, max, min: min === Infinity ? 0 : min }
}

function CustomChartTooltip({active, payload, label, unit, labelKey, color}) {
  if (!active || !payload || !payload.length) return null
  const val = payload[0].value
  return (
    <div style={{background:'#090d16',border:`1px solid ${color || '#2563eb'}`,borderRadius:6,padding:'8px 12px',boxShadow:'0 8px 24px rgba(0,0,0,0.6)',minWidth:120}}>
      <div style={{fontSize:10,color:'#94a3b8',marginBottom:4}}>{label}</div>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <span style={{width:8,height:8,borderRadius:'50%',background:color||'#2563eb'}}/>
        <span style={{fontSize:12,fontWeight:600,color:'#fff'}}>{labelKey}:</span>
        <span style={{fontSize:13,fontWeight:700,color:color||'#38bdf8'}}>
          {typeof val === 'number' ? val.toFixed(val < 10 && val % 1 !== 0 ? 2 : 1) : val} {unit}
        </span>
      </div>
    </div>
  )
}

function CustomDualTooltip({active, payload, label, unit, label1, label2, color1, color2, key1, key2}) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{background:'#090d16',border:'1px solid #1e293b',borderRadius:6,padding:'8px 12px',boxShadow:'0 8px 24px rgba(0,0,0,0.6)',minWidth:150}}>
      <div style={{fontSize:10,color:'#94a3b8',marginBottom:6}}>{label}</div>
      <div style={{display:'flex',flexDirection:'column',gap:4}}>
        {payload.map((p, idx) => {
          const isFirst = p.dataKey === key1
          const c = isFirst ? color1 : color2
          const lbl = isFirst ? label1 : label2
          return (
            <div key={idx} style={{display:'flex',alignItems:'center',gap:8,justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:c}}/>
                <span style={{fontSize:11,color:'#cbd5e1'}}>{lbl}:</span>
              </div>
              <span style={{fontSize:12,fontWeight:700,color:c}}>
                {typeof p.value === 'number' ? p.value.toFixed(p.value < 10 && p.value % 1 !== 0 ? 2 : 1) : p.value} {unit}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CustomMultiTooltip({active, payload, label, seriesMeta}) {
  if (!active || !payload || !payload.length) return null
  return (
    <div style={{background:'#090d16',border:'1px solid #1e293b',borderRadius:6,padding:'8px 12px',boxShadow:'0 8px 24px rgba(0,0,0,0.6)',minWidth:160}}>
      <div style={{fontSize:10,color:'#94a3b8',marginBottom:6}}>{label}</div>
      <div style={{display:'flex',flexDirection:'column',gap:4}}>
        {payload.map((p, idx) => {
          const meta = (seriesMeta || []).find(s => s.key === p.dataKey) || {}
          return (
            <div key={idx} style={{display:'flex',alignItems:'center',gap:8,justifyContent:'space-between'}}>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:meta.color || '#fff'}}/>
                <span style={{fontSize:11,color:'#cbd5e1'}}>{meta.label || p.dataKey}:</span>
              </div>
              <span style={{fontSize:12,fontWeight:700,color:meta.color || '#fff'}}>
                {typeof p.value === 'number' ? p.value.toFixed(1) : p.value} {meta.unit || ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BigChart({
  data,
  dataKey,
  color = '#2563eb',
  title,
  unit = '',
  height = 180,
  defaultChartType = 'area',
  onMaximize = null,
  showControls = true,
}) {
  const [chartType, setChartType] = useState(defaultChartType)
  const stats = useMemo(() => getSeriesStats(data, dataKey), [data, dataKey])

  useEffect(() => {
    if (defaultChartType) setChartType(defaultChartType)
  }, [defaultChartType])

  if (!data || data.length === 0) {
    return (
      <div className="card" style={{padding:16,display:'flex',flexDirection:'column',justifyContent:'space-between',minHeight:height+50}}>
        <h4 style={{margin:0,fontSize:13,color:'#94a3b8',fontWeight:600}}>{title}</h4>
        <div style={{display:'flex',alignItems:'center',justifyContent:'center',color:'#64748b',fontSize:12,flex:1}}>
          Нет данных за выбранный период
        </div>
      </div>
    )
  }

  const gradId = `bg-${dataKey}-${color.replace('#','')}`

  return (
    <div className="card" style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:8,background:'#101726',border:'1px solid #1e293b'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,flexWrap:'wrap'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <h4 style={{margin:0,fontSize:13,fontWeight:600,color:'#fff'}}>{title}</h4>
            {stats && (
              <span style={{fontSize:11,fontWeight:700,color:color,background:`${color}18`,padding:'1px 6px',borderRadius:4,border:`1px solid ${color}33`}}>
                {stats.last != null ? stats.last.toFixed(stats.last < 10 && stats.last % 1 !== 0 ? 2 : 1) : '—'} {unit}
              </span>
            )}
          </div>
          {stats && (
            <div style={{display:'flex',gap:8,marginTop:3,fontSize:10,color:'#94a3b8'}}>
              <span>Ср: <strong style={{color:'#cbd5e1'}}>{stats.avg.toFixed(1)}</strong></span>
              <span>Пик: <strong style={{color: stats.max > 80 && unit === '%' ? '#f87171' : '#cbd5e1'}}>{stats.max.toFixed(1)}</strong></span>
              <span>Мин: <strong style={{color:'#94a3b8'}}>{stats.min.toFixed(1)}</strong></span>
            </div>
          )}
        </div>
        {showControls && (
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{display:'inline-flex',background:'#090d16',borderRadius:6,border:'1px solid #1e293b',padding:2}}>
              {['area', 'line', 'bar'].map(t => (
                <button
                  key={t}
                  onClick={() => setChartType(t)}
                  title={t === 'area' ? 'Область (Area)' : t === 'line' ? 'Линии (Line)' : 'Столбцы (Bar)'}
                  style={{
                    background: chartType === t ? '#1e293b' : 'transparent',
                    border: 'none',
                    color: chartType === t ? '#38bdf8' : '#64748b',
                    padding: '2px 6px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                  {t}
                </button>
              ))}
            </div>
            {onMaximize && (
              <button
                onClick={onMaximize}
                title="Развернуть график"
                style={{
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  color: '#94a3b8',
                  padding: '3px 6px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                <Maximize2 size={11}/>
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{height, width:'100%', minWidth:0}}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart data={data} margin={{top:6,right:10,left:-24,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6}/>
              <XAxis dataKey="time" tick={{fill:'#64748b',fontSize:10}} interval="preserveStartEnd" minTickGap={30}/>
              <YAxis tick={{fill:'#64748b',fontSize:10}} domain={unit==='%' ? [0, 100] : ['auto', 'auto']} width={32}/>
              <Tooltip content={<CustomChartTooltip unit={unit} labelKey={title} color={color}/>}/>
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={false} isAnimationActive={false} connectNulls={true}/>
            </LineChart>
          ) : chartType === 'bar' ? (
            <BarChart data={data} margin={{top:6,right:10,left:-24,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6}/>
              <XAxis dataKey="time" tick={{fill:'#64748b',fontSize:10}} interval="preserveStartEnd" minTickGap={30}/>
              <YAxis tick={{fill:'#64748b',fontSize:10}} domain={unit==='%' ? [0, 100] : ['auto', 'auto']} width={32}/>
              <Tooltip content={<CustomChartTooltip unit={unit} labelKey={title} color={color}/>}/>
              <Bar dataKey={dataKey} fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false}/>
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{top:6,right:10,left:-24,bottom:0}}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.45}/>
                  <stop offset="100%" stopColor={color} stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6}/>
              <XAxis dataKey="time" tick={{fill:'#64748b',fontSize:10}} interval="preserveStartEnd" minTickGap={30}/>
              <YAxis tick={{fill:'#64748b',fontSize:10}} domain={unit==='%' ? [0, 100] : ['auto', 'auto']} width={32}/>
              <Tooltip content={<CustomChartTooltip unit={unit} labelKey={title} color={color}/>}/>
              <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#${gradId})`} isAnimationActive={false} dot={false} connectNulls={true}/>
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function DualLineChart({
  data,
  key1,
  key2,
  color1 = '#22d3ee',
  color2 = '#f472b6',
  label1 = 'Key 1',
  label2 = 'Key 2',
  title,
  unit = '',
  height = 180,
  defaultChartType = 'area',
  onMaximize = null,
  showControls = true,
}) {
  const [chartType, setChartType] = useState(defaultChartType)
  const [visible1, setVisible1] = useState(true)
  const [visible2, setVisible2] = useState(true)

  const stats1 = useMemo(() => getSeriesStats(data, key1), [data, key1])
  const stats2 = useMemo(() => getSeriesStats(data, key2), [data, key2])

  useEffect(() => {
    if (defaultChartType) setChartType(defaultChartType)
  }, [defaultChartType])

  if (!data || data.length === 0) return null

  const grad1 = `bg-dual-${key1}-${color1.replace('#','')}`
  const grad2 = `bg-dual-${key2}-${color2.replace('#','')}`

  return (
    <div className="card" style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:8,background:'#101726',border:'1px solid #1e293b'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:8,flexWrap:'wrap'}}>
        <div>
          <h4 style={{margin:0,fontSize:13,fontWeight:600,color:'#fff'}}>{title}</h4>
          <div style={{display:'flex',gap:8,marginTop:3,flexWrap:'wrap'}}>
            {stats1 && (
              <button
                onClick={() => setVisible1(v => !v)}
                style={{
                  background: visible1 ? `${color1}15` : '#1e293b33',
                  border: `1px solid ${visible1 ? color1 + '44' : '#1e293b'}`,
                  borderRadius: 4,
                  padding: '1px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  color: visible1 ? color1 : '#64748b',
                  opacity: visible1 ? 1 : 0.5,
                }}>
                <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:visible1?color1:'#64748b'}}/>
                <span>{label1}: <strong>{stats1.last != null ? stats1.last.toFixed(stats1.last < 10 && stats1.last % 1 !== 0 ? 2 : 1) : '—'} {unit}</strong> (пик {stats1.max.toFixed(1)})</span>
              </button>
            )}
            {stats2 && (
              <button
                onClick={() => setVisible2(v => !v)}
                style={{
                  background: visible2 ? `${color2}15` : '#1e293b33',
                  border: `1px solid ${visible2 ? color2 + '44' : '#1e293b'}`,
                  borderRadius: 4,
                  padding: '1px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 10,
                  color: visible2 ? color2 : '#64748b',
                  opacity: visible2 ? 1 : 0.5,
                }}>
                <span style={{display:'inline-block',width:6,height:6,borderRadius:'50%',background:visible2?color2:'#64748b'}}/>
                <span>{label2}: <strong>{stats2.last != null ? stats2.last.toFixed(stats2.last < 10 && stats2.last % 1 !== 0 ? 2 : 1) : '—'} {unit}</strong> (пик {stats2.max.toFixed(1)})</span>
              </button>
            )}
          </div>
        </div>
        {showControls && (
          <div style={{display:'flex',alignItems:'center',gap:4}}>
            <div style={{display:'inline-flex',background:'#090d16',borderRadius:6,border:'1px solid #1e293b',padding:2}}>
              {['area', 'line', 'bar'].map(t => (
                <button
                  key={t}
                  onClick={() => setChartType(t)}
                  style={{
                    background: chartType === t ? '#1e293b' : 'transparent',
                    border: 'none',
                    color: chartType === t ? '#38bdf8' : '#64748b',
                    padding: '2px 6px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}>
                  {t}
                </button>
              ))}
            </div>
            {onMaximize && (
              <button
                onClick={onMaximize}
                title="Развернуть график"
                style={{
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  color: '#94a3b8',
                  padding: '3px 6px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}>
                <Maximize2 size={11}/>
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{height, width:'100%', minWidth:0}}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart data={data} margin={{top:6,right:10,left:-24,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6}/>
              <XAxis dataKey="time" tick={{fill:'#64748b',fontSize:10}} interval="preserveStartEnd" minTickGap={30}/>
              <YAxis tick={{fill:'#64748b',fontSize:10}} width={32}/>
              <Tooltip content={<CustomDualTooltip unit={unit} label1={label1} label2={label2} color1={color1} color2={color2} key1={key1} key2={key2}/>}/>
              {visible1 && <Line type="monotone" dataKey={key1} stroke={color1} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={true}/>}
              {visible2 && <Line type="monotone" dataKey={key2} stroke={color2} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={true}/>}
            </LineChart>
          ) : chartType === 'bar' ? (
            <BarChart data={data} margin={{top:6,right:10,left:-24,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6}/>
              <XAxis dataKey="time" tick={{fill:'#64748b',fontSize:10}} interval="preserveStartEnd" minTickGap={30}/>
              <YAxis tick={{fill:'#64748b',fontSize:10}} width={32}/>
              <Tooltip content={<CustomDualTooltip unit={unit} label1={label1} label2={label2} color1={color1} color2={color2} key1={key1} key2={key2}/>}/>
              {visible1 && <Bar dataKey={key1} fill={color1} radius={[2, 2, 0, 0]} isAnimationActive={false}/>}
              {visible2 && <Bar dataKey={key2} fill={color2} radius={[2, 2, 0, 0]} isAnimationActive={false}/>}
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{top:6,right:10,left:-24,bottom:0}}>
              <defs>
                <linearGradient id={grad1} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color1} stopOpacity={0.4}/>
                  <stop offset="100%" stopColor={color1} stopOpacity={0.02}/>
                </linearGradient>
                <linearGradient id={grad2} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color2} stopOpacity={0.35}/>
                  <stop offset="100%" stopColor={color2} stopOpacity={0.02}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6}/>
              <XAxis dataKey="time" tick={{fill:'#64748b',fontSize:10}} interval="preserveStartEnd" minTickGap={30}/>
              <YAxis tick={{fill:'#64748b',fontSize:10}} width={32}/>
              <Tooltip content={<CustomDualTooltip unit={unit} label1={label1} label2={label2} color1={color1} color2={color2} key1={key1} key2={key2}/>}/>
              {visible1 && <Area type="monotone" dataKey={key1} stroke={color1} strokeWidth={2} fill={`url(#${grad1})`} isAnimationActive={false} dot={false} connectNulls={true}/>}
              {visible2 && <Area type="monotone" dataKey={key2} stroke={color2} strokeWidth={2} fill={`url(#${grad2})`} isAnimationActive={false} dot={false} connectNulls={true}/>}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function MultiMetricChart({
  data,
  height = 240,
  onMaximize = null,
}) {
  const [activeSeries, setActiveSeries] = useState({
    cpu: true,
    ram: true,
    disk: true,
    load1: false,
    ping: false,
  })

  const seriesMeta = [
    {key:'cpu', label:'CPU %', color:'#2563eb', unit:'%'},
    {key:'ram', label:'RAM %', color:'#00d4ff', unit:'%'},
    {key:'disk', label:'Диск %', color:'#facc15', unit:'%'},
    {key:'load1', label:'Load 1m', color:'#a78bfa', unit:''},
    {key:'ping', label:'Пинг', color:'#4ade80', unit:'мс'},
  ]

  const toggle = (k) => setActiveSeries(prev => ({...prev, [k]: !prev[k]}))

  return (
    <div className="card" style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:10,background:'#101726',border:'1px solid #1e293b'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <h4 style={{margin:0,fontSize:14,fontWeight:700,color:'#fff'}}>Сводный монитор ресурсов</h4>
            <span style={{fontSize:11,color:'#64748b'}}>Единая шкала ресурсов</span>
          </div>
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
          {seriesMeta.map(s => {
            const isActive = activeSeries[s.key]
            return (
              <button
                key={s.key}
                onClick={() => toggle(s.key)}
                style={{
                  background: isActive ? `${s.color}22` : '#090d16',
                  border: `1px solid ${isActive ? s.color + '66' : '#1e293b'}`,
                  borderRadius: 6,
                  padding: '3px 8px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  fontWeight: 600,
                  color: isActive ? s.color : '#64748b',
                  transition: 'all 0.15s ease',
                }}>
                <span style={{width:7,height:7,borderRadius:'50%',background:isActive?s.color:'#64748b'}}/>
                <span>{s.label}</span>
              </button>
            )
          })}
          {onMaximize && (
            <button
              onClick={onMaximize}
              title="Развернуть график"
              style={{
                background: '#090d16',
                border: '1px solid #1e293b',
                color: '#94a3b8',
                padding: '4px 6px',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}>
              <Maximize2 size={12}/>
            </button>
          )}
        </div>
      </div>
      <div style={{height, width:'100%'}}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{top:6,right:10,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6}/>
            <XAxis dataKey="time" tick={{fill:'#64748b',fontSize:10}} interval="preserveStartEnd" minTickGap={30}/>
            <YAxis tick={{fill:'#64748b',fontSize:10}} width={35}/>
            <Tooltip content={<CustomMultiTooltip seriesMeta={seriesMeta}/>}/>
            {seriesMeta.map(s => (
              activeSeries[s.key] ? (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2.2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={true}
                />
              ) : null
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function InfoRow({label, value, color}) {
  return (
    <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #1e293b'}}>
      <span style={{fontSize:12,color:'#9aa4b2'}}>{label}</span>
      <span style={{fontSize:12,color:color||'#fff',fontWeight:500}}>{value ?? '—'}</span>
    </div>
  )
}

function DataTable({columns, rows, emptyText='Нет данных', searchable=true}) {
  const [search, setSearch] = useState('')
  const filteredRows = useMemo(()=>{
    if(!rows||!search.trim()) return rows||[]
    const q = search.toLowerCase()
    return rows.filter(r=>columns.some(c=>{
      const val = c.render ? null : r[c.key]
      return val!=null && String(val).toLowerCase().includes(q)
    }))
  },[rows, search, columns])
  if(!rows||rows.length===0) return <div style={{padding:20,textAlign:'center',color:'#9aa4b2',fontSize:12}}>{emptyText}</div>
  return (
    <div style={{overflowX:'auto'}}>
      {searchable && rows.length>3 && (
        <div style={{marginBottom:8}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по таблице..." style={{width:'100%',padding:'6px 10px',borderRadius:4,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:11,outline:'none'}}/>
        </div>
      )}
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
        <thead>
          <tr>{columns.map(c=><th key={c.key} style={{textAlign:'left',padding:'8px 10px',color:'#9aa4b2',borderBottom:'1px solid #1e293b',fontSize:11,fontWeight:600}}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {filteredRows.length===0 ? (
            <tr><td colSpan={columns.length} style={{padding:16,textAlign:'center',color:'#9aa4b2',fontSize:12}}>Ничего не найдено</td></tr>
          ) : filteredRows.map((r,i)=>(
            <tr key={i} style={{borderBottom:'1px solid #1e293b'}}>
              {columns.map(c=><td key={c.key} style={{padding:'8px 10px',color:c.color?c.color(r):'#fff'}}>{c.render?c.render(r):r[c.key]??'—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {search && <div style={{fontSize:10,color:'#9aa4b2',marginTop:4}}>Найдено: {filteredRows.length} из {rows.length}</div>}
    </div>
  )
}

const TABS = [
  {id:'overview', label:'Обзор', icon: Activity},
  {id:'cpu', label:'CPU', icon: Cpu},
  {id:'memory', label:'Память', icon: MemoryStick},
  {id:'disks', label:'Диски', icon: HardDrive},
  {id:'network', label:'Сеть', icon: Network},
  {id:'processes', label:'Процессы', icon: Sliders},
  {id:'services', label:'Сервисы', icon: Power},
  {id:'docker', label:'Docker', icon: Boxes},
  {id:'security', label:'Безопасность', icon: ShieldCheck},
  {id:'logs', label:'Логи', icon: FileText},
  {id:'system', label:'Система', icon: Server},
  {id:'databases', label:'БД', icon: Database},
  {id:'network_equipment', label:'Сетевое обор.', icon: Radio},
  {id:'ssl_certificates', label:'SSL', icon: Lock},
]

const MINI_CARDS = [
  {label:'Load 1m', key:'load1', color:'#a78bfa'},
  {label:'Load 5m', key:'load5', color:'#818cf8'},
  {label:'Load 15m', key:'load15', color:'#6366f1'},
  {label:'Процессы', key:'processes', color:'#06b6d4'},
  {label:'Аптайм', key:'uptime_hours', color:'#4ade80', unit:'ч'},
  {label:'Net In', key:'net_in', color:'#22d3ee', unit:'Mbps'},
  {label:'Net Out', key:'net_out', color:'#f472b6', unit:'Mbps'},
  {label:'IOPS Read', key:'iops_read', color:'#fbbf24', unit:'IO/s'},
  {label:'IOPS Write', key:'iops_write', color:'#fb923c', unit:'IO/s'},
]

function findMatchedVm(server, vmsList) {
  if (!server || !vmsList || !vmsList.length) return null
  const sh = (server.host || '').trim()
  const sn = (server.name || '').toLowerCase().trim()
  return vmsList.find(v => {
    const vIp = (v.ip_address || '').trim()
    const vn = (v.name || '').toLowerCase().trim()
    if (vIp && sh && (vIp === sh || sh.includes(vIp) || vIp.includes(sh))) return true
    if (vn && sn && (vn === sn || vn.includes(sn) || sn.includes(vn))) return true
    if (sh === '192.168.17.49' && (vn.includes('ssv.hrm') || vIp === '192.168.17.49')) return true
    if (sh === '192.168.17.51' && (vn.includes('davomaat') || vIp === '192.168.17.51')) return true
    if (sh === '192.168.17.50' && (vn.includes('monitoring') || vIp === '192.168.17.50')) return true
    return false
  })
}

export default function Servers() {
  const [mounted, setMounted] = useState(false)
  const [servers, setServers] = useState([])
  const [vms, setVms] = useState([])
  const [selected, setSelected] = useState(null)
  const [metrics, setMetrics] = useState([])
  const [serverDetail, setServerDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const wsRef = useRef(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({id:'', name:'', host:'', monitor_type:'agent', ssh_user:'', ssh_port:'22', ssh_password:'', ssh_key_path:'', winrm_user:'', winrm_password:'', winrm_port:'5985', winrm_use_ssl:false})
  const [addError, setAddError] = useState(null)
  const [addLoading, setAddLoading] = useState(false)
  const [serverSearch, setServerSearch] = useState('')
  const [serverStatusFilter, setServerStatusFilter] = useState('all')
  const [svcSearch, setSvcSearch] = useState('')
  const [svcFilter, setSvcFilter] = useState('all')
  const [portSearch, setPortSearch] = useState('')
  const [logTab, setLogTab] = useState('system')
  const [logSearch, setLogSearch] = useState('')
  const [timeRange, setTimeRange] = useState({from: null, to: null, preset: 'all'})
  const selectedRef = useRef(null)
  const timeRangeRef = useRef({from: null, to: null, preset: 'all'})

  // ── Agent install modal ──────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false)
  const [modalTab, setModalTab] = useState('agent')
  const [upgradingAgentId, setUpgradingAgentId] = useState(null)
  const [agentPlatform, setAgentPlatform] = useState('windows')
  const [agentForm, setAgentForm] = useState({serverId:'', name:'', host:'', interval:'15'})
  const [agentToken, setAgentToken] = useState('')
  const [generateAgentToken, setGenerateAgentToken] = useState(true)
  const [agentInfo, setAgentInfo] = useState({version:'—', ingest_api_key:'', available_files:[]})
  const [agentCopied, setAgentCopied] = useState(false)
  const [agentRegDone, setAgentRegDone] = useState(false)
  const [agentRegLoading, setAgentRegLoading] = useState(false)
  const [selectedAgentKeys, setSelectedAgentKeys] = useState([])
  const [selectedAgentKey, setSelectedAgentKey] = useState('')
  const [selectedKeyLoading, setSelectedKeyLoading] = useState(false)
  const [serverUptime, setServerUptime] = useState(null)
  const [showAgentKeysModal, setShowAgentKeysModal] = useState(false)
  const [overviewChartFilter, setOverviewChartFilter] = useState('all')
  const [overviewGridColumns, setOverviewGridColumns] = useState(2)
  const [globalChartType, setGlobalChartType] = useState('area')
  const [zoomedChart, setZoomedChart] = useState(null)
  const [showMiniMetrics, setShowMiniMetrics] = useState(true)

  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { timeRangeRef.current = timeRange }, [timeRange])

  function toNumber(v, fallback = null) {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }

  function normalizeMetrics(metrics = {}) {
    const out = {}
    for(const [k, m] of Object.entries(metrics || {})) {
      if(m && typeof m === 'object' && Object.prototype.hasOwnProperty.call(m, 'value')) {
        out[k] = { ...m, value: toNumber(m.value, m.value) }
      } else {
        out[k] = m
      }
    }
    return out
  }

  const PRESET_MS_MAP = {'5m':5*60e3,'15m':15*60e3,'30m':30*60e3,'1h':60*60e3,'3h':3*60*60e3,'6h':6*60*60e3,'12h':12*60*60e3,'24h':24*60*60e3}

  function getEffectiveRange(range) {
    if (!range || range.preset === 'all') return {from: null, to: null}
    if (range.preset === 'custom') return {from: range.from, to: range.to}
    const ms = PRESET_MS_MAP[range.preset]
    return ms ? {from: Date.now() - ms, to: Date.now()} : {from: range.from, to: range.to}
  }

  function isTimestampInSelectedRange(timestampMs, range) {
    if (!range || range.preset === 'all') return true
    const {from, to} = getEffectiveRange(range)
    if (from && timestampMs < from) return false
    // для кастомного диапазона проверяем to; для пресетов — нет (данные актуальны)
    if (range.preset === 'custom' && to && timestampMs > to) return false
    return true
  }

  const loadServers = async () => {
    setLoading(true); setError(null)
    try {
      const d = await apiFetch('/api/servers')
      const mapped = (d.servers || []).map(s => {
        const lastMetrics = normalizeMetrics(s.last_metrics || {})
        const pingFromMetrics = lastMetrics.ping?.value
        return {
          ...s,
          last_metrics: lastMetrics,
          last_ping: s.last_ping ?? pingFromMetrics ?? null,
        }
      })
      setServers(mapped)
      if (!selectedRef.current && mapped.length > 0) {
        setSelected(mapped[0])
      }
      apiFetch('/api/vm/all').then(vd => setVms(vd.vms || [])).catch(() => {})
    } catch(e) { setError('Ошибка загрузки серверов'); setServers([]) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    setMounted(true)
    loadServers()
  }, [])

  useEffect(() => {
    if (selected?.monitor_type === 'agent') {
      setSelectedAgentKey('')
      loadServerAgentKeys(selected.id)
    } else {
      setSelectedAgentKeys([])
      setSelectedAgentKey('')
    }
  }, [selected])

  function loadServerUptime(id) {
    Promise.resolve().then(() =>
      apiFetch('/api/sla/summary')
        .then(d => {
          const item = (d.summary || []).find(s => s.target_type === 'server' && s.target_id === id)
          setServerUptime(item || null)
        })
        .catch(() => setServerUptime(null))
    )
  }

  function loadMetrics(id, range) {
    Promise.resolve().then(() => {
      const {from, to} = getEffectiveRange(range ?? timeRange)
      let url = `/api/servers/${id}/metrics`
      const params = []
      if(from) params.push(`from_ts=${Math.floor(from/1000)}`)
      if(to)   params.push(`to_ts=${Math.floor(to/1000)}`)
      if(params.length) url += '?' + params.join('&')
      apiFetch(url).then(d => setMetrics(d.metrics || [])).catch(()=>setMetrics([]))
      apiFetch(`/api/servers/${id}/detail`).then(d => setServerDetail(d.detail || null)).catch(()=>setServerDetail(null))
    })
  }

  const handleTimeRangeChange = useCallback((range) => {
    setTimeRange(range)
    if(selected) loadMetrics(selected.id, range)
  }, [selected])

  async function handleAddServer(e) {
    e.preventDefault(); setAddError(null)
    if(!addForm.id.trim() || !addForm.name.trim()) { setAddError('ID и имя обязательны'); return }
    setAddLoading(true)
    try {

      const body = {
        id: addForm.id.trim(), name: addForm.name.trim(), host: addForm.host.trim() || null,
        monitor_type: addForm.monitor_type || 'agent',
      }
      if(addForm.monitor_type === 'ssh') {
        body.ssh_user = addForm.ssh_user.trim() || 'root'
        body.ssh_port = parseInt(addForm.ssh_port) || 22
        if(addForm.ssh_password.trim()) body.ssh_password = addForm.ssh_password
        if(addForm.ssh_key_path.trim()) body.ssh_key_path = addForm.ssh_key_path
      }
      if(addForm.monitor_type === 'winrm') {
        body.winrm_user = addForm.winrm_user.trim() || 'Administrator'
        body.winrm_password = addForm.winrm_password
        body.winrm_port = parseInt(addForm.winrm_port) || 5985
        body.winrm_use_ssl = addForm.winrm_use_ssl || false
      }
      const res = await apiFetch('/api/servers', { method: 'POST', body: JSON.stringify(body) })
      if(res.detail) { setAddError(res.detail); return }
      setAddForm({id:'', name:'', host:'', monitor_type:'agent', ssh_user:'', ssh_port:'22', ssh_password:'', ssh_key_path:'', winrm_user:'', winrm_password:'', winrm_port:'5985', winrm_use_ssl:false}); setShowAdd(false); await loadServers()
    } catch(err) { setAddError(err.message || 'Ошибка') }
    finally { setAddLoading(false) }
  }

  // Load agent info and prefill install form when modal opens
  useEffect(() => {
    if (!showModal || modalTab !== 'agent') return
    Promise.resolve().then(() => {
      apiFetch('/api/agent/info').then(d => setAgentInfo(d)).catch(() => {})
    })
    if (selected) {
      setAgentForm(prev => ({
        ...prev,
        serverId: prev.serverId || selected.id || '',
        name: prev.name || selected.name || '',
      }))
    }
  }, [showModal, modalTab, selected])

  // Reset modal state on close
  function closeModal() {
    setShowModal(false); setAgentRegDone(false); setAgentCopied(false); setAgentToken(''); setGenerateAgentToken(true)
  }

  async function downloadAgentFile(filename) {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    try {
      const resp = await fetch(`${base}/api/agent/download/${filename}`, {
        headers: token ? {Authorization: `Bearer ${token}`} : {}
      })
      if (!resp.ok) throw new Error(`${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = filename
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch(e) { alert('Ошибка скачивания: ' + e.message) }
  }

  function buildInstallCommand() {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const sid = agentForm.serverId.trim() || 'my-server'
    const key = agentToken || agentInfo.ingest_api_key || ''
    const iv = agentForm.interval.trim() || '15'
    if (agentPlatform === 'windows') {
      return [
        `# Вариант 1 — GUI-установщик (рекомендуется):`,
        `# Скачайте MonitoringAgentInstaller.exe и запустите — откроется мастер установки.`,
        ``,
        `# Вариант 2 — PowerShell (от имени Администратора):`,
        `Invoke-WebRequest "${base}/api/agent/download/install.ps1" -OutFile install.ps1 -UseBasicParsing`,
        `Set-ExecutionPolicy Bypass -Scope Process -Force`,
        `.\\install.ps1 -BackendUrl "${base}" -ServerId "${sid}" -Interval ${iv}${key ? ` -AgentKey "${key}"` : ''}`,
      ].join('\n')
    }
    const arch = agentPlatform === 'linux-arm64' ? 'arm64' : 'amd64'
    return [
      `# 1. Скачайте установщик:`,
      `curl -O ${base}/api/agent/download/install.sh`,
      ``,
      `# 2. Установите:`,
      `bash install.sh --backend "${base}" --server-id "${sid}" --interval ${iv}${key ? ` --agent-key "${key}"` : ''} --arch ${arch}`,
    ].join('\n')
  }

  function buildServerInstallCommand() {
    const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const sid = selected?.id || 'my-server'
    const key = selectedAgentKey || selectedAgentKeys.find(k => k.is_active)?.token || ''
    if (!sid) return ''
    return [
      `# Linux`,
      `curl -O ${base}/api/agent/download/install.sh`,
      `bash install.sh --backend "${base}" --server-id "${sid}"${key ? ` --agent-key "${key}"` : ''}`,
      ``,
      `# Windows`,
      `Invoke-WebRequest "${base}/api/agent/download/install.ps1" -OutFile install.ps1 -UseBasicParsing`,
      `Set-ExecutionPolicy Bypass -Scope Process -Force`,
      `.\\install.ps1 -BackendUrl "${base}" -ServerId "${sid}"${key ? ` -AgentKey "${key}"` : ''}`,
    ].join('\n')
  }

  async function handleRegisterAgent(e) {
    e.preventDefault()
    if (!agentForm.serverId.trim() || !agentForm.name.trim()) { alert('ID и имя обязательны'); return }
    setAgentRegLoading(true)
    try {

      const res = await apiFetch('/api/servers', { method: 'POST', body: JSON.stringify({
        id: agentForm.serverId.trim(), name: agentForm.name.trim(),
        host: agentForm.host.trim() || null, monitor_type: 'agent',
        create_agent_token: generateAgentToken
      })})
      if (res.agent_token) {
        setAgentToken(res.agent_token)
      }
      setAgentRegDone(true)
      await loadServers()
    } catch(e) { alert('Ошибка: ' + e.message) }
    finally { setAgentRegLoading(false) }
  }

  async function loadServerAgentKeys(serverId) {
    if (!serverId) return
    try {

      const res = await apiFetch(`/api/servers/${serverId}/agent-keys`)
      setSelectedAgentKeys(res || [])
    } catch (_e) {
      setSelectedAgentKeys([])
    }
  }

  async function handleCreateAgentKey() {
    if (!selected?.id) return
    setSelectedKeyLoading(true)
    try {

      const res = await apiFetch(`/api/servers/${selected.id}/agent-key`, { method: 'POST' })
      if (res.token) {
        setSelectedAgentKey(res.token)
        setSelectedAgentKeys(prev => [res, ...prev])
      }
    } catch(e) {
      alert('Ошибка создания ключа: ' + e.message)
    } finally {
      setSelectedKeyLoading(false)
    }
  }

  async function handleRevokeAgentKey(keyId) {
    if (!keyId || !selected?.id || !confirm('Отозвать этот ключ агента?')) return
    try {

      await apiFetch(`/api/servers/${selected.id}/agent-keys/${keyId}`, { method: 'DELETE' })
      setSelectedAgentKeys(prev => prev.map(key => key.id === keyId ? { ...key, is_active: false } : key))
    } catch (e) {
      alert('Ошибка отзыва ключа: ' + e.message)
    }
  }

  async function handleUpgradeAgent(serverId) {
    if (!serverId) return
    if (!confirm(`Запустить обновление агента на сервере ${serverId}?`)) return
    setUpgradingAgentId(serverId)
    try {
      const res = await apiFetch(`/api/servers/${serverId}/upgrade-agent`, { method: 'POST' })
      alert(`[+] ${res.message || 'Обновление запущено!'}\nЦелевая версия: v${res.target_version || ''}${res.details ? '\n\nЛог:\n' + res.details : ''}`)
      await loadServers()
    } catch (e) {
      alert('Ошибка обновления агента: ' + (e.message || e))
    } finally {
      setUpgradingAgentId(null)
    }
  }

  async function handleUpgradeAllAgents() {
    if (!confirm('Запланировать обновление агентов для всех серверов?')) return
    try {
      const res = await apiFetch('/api/agent/upgrade-all', { method: 'POST' })
      alert(`[+] ${res.message || 'Обновление запланировано!'}\nВсего серверов: ${res.count || 0}`)
      await loadServers()
    } catch (e) {
      alert('Ошибка: ' + (e.message || e))
    }
  }

  async function handleDeleteServer(serverId) {
    if(!confirm('Удалить сервер ' + serverId + '?')) return
    try {

      await apiFetch(`/api/servers/${serverId}`, {method: 'DELETE'})
      if(selected?.id === serverId) { setSelected(null); setMetrics([]); setServerDetail(null) }
      await loadServers()
    } catch(err) { setError('Ошибка удаления') }
  }

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL || ''
    const wsToken = localStorage.getItem('token')
    const wsUrl = base.replace('http', 'ws') + '/ws' + (wsToken ? `?token=${wsToken}` : '')
    try {
      wsRef.current = new WebSocket(wsUrl)
      wsRef.current.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data)
          if(msg.metric) {
            const pl = msg.metric.payload || msg.metric
            if(pl.server_id) {
              const wsMetrics = normalizeMetrics(pl.metrics || {})
              const wsPing = pl.value ?? wsMetrics.ping?.value
              setServers(prev => prev.map(s => s.id === pl.server_id ? {...s, status: pl.status||s.status, last_ping: wsPing ?? s.last_ping, last_metrics: Object.keys(wsMetrics).length ? wsMetrics : s.last_metrics} : s))
              setMetrics(prev => {
                const currentSelected = selectedRef.current
                if(!currentSelected || pl.server_id !== currentSelected.id) return prev
                const nowMs = Date.now()
                if(!isTimestampInSelectedRange(nowMs, timeRangeRef.current)) return prev
                return [...prev.slice(-199), {payload: {...pl, metrics: wsMetrics}, received_at: nowMs/1000}]
              })
            }
          }
        } catch(e) {}
      }
    } catch(e) {}
    return () => { if(wsRef.current) wsRef.current.close() }
  }, [])

  // Periodic detail refresh
  useEffect(() => {
    if(!selected) return
    const iv = setInterval(() => {
      Promise.resolve().then(() => apiFetch(`/api/servers/${selected.id}/detail`).then(d => setServerDetail(d.detail || null)).catch(()=>{})
      )
    }, 15000)
    return () => clearInterval(iv)
  }, [selected])

  const chartSeries = useMemo(()=>{
    return metrics.map(m => {
      const p = m.payload || {}
      const mets = p.metrics || {}
      const rawTs = m.received_at ? (typeof m.received_at==='number' ? m.received_at*1000 : new Date(m.received_at).getTime()) : Date.now()
      const t = new Date(rawTs)
      const showDate = timeRange.preset && ['6h','12h','24h','custom'].includes(timeRange.preset)
      const time = showDate
        ? t.toLocaleString('ru-RU', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
        : t.toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
      const point = {time, _ts: rawTs}
      for(const k of ['cpu','ram','disk','swap','ping','net_in','net_out','load1','load5','load15','iops_read','iops_write','processes']) {
        if(mets[k]) point[k] = toNumber(mets[k].value, null)
      }
      if((point.ping == null) && p.value !== undefined) point.ping = toNumber(p.value, null)
      return point
    })
  },[metrics, timeRange.preset])

  const selServer = selected ? servers.find(s=>s.id===selected.id) || selected : null
  const curMetrics = selServer?.last_metrics || {}
  const agentData = serverDetail || selServer?.agent_data || {}

  // ══════ TAB RENDERERS ══════

  function renderOverview() {
    return (<>
      <div className="card" style={{padding:16}}>
        <div style={{display:'flex',justifyContent:'space-around',flexWrap:'wrap',gap:16}}>
          <GaugeRing value={curMetrics.cpu?.value||0} color="#2563eb" label="CPU" unit="%"/>
          <GaugeRing value={curMetrics.ram?.value||0} color="#00d4ff" label="RAM" unit="%"/>
          <GaugeRing value={curMetrics.disk?.value||0} color="#facc15" label="Диск" unit="%"/>
          <GaugeRing value={curMetrics.swap?.value||0} color="#f97316" label="Swap" unit="%"/>
          <GaugeRing value={curMetrics.ping?.value||0} max={500} color="#4ade80" label="Пинг" unit="мс"/>
        </div>
      </div>
      {(() => {
        const matchedVm = findMatchedVm(selServer, vms)
        if (!matchedVm) return null
        return (
          <div className="card" style={{padding:'14px 16px',background:'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(15,23,42,0.6) 100%)',border:'1px solid rgba(99,102,241,0.25)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:18}}>🧩</span>
                <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>Виртуализация VMware ESXi</span>
                <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,background:'rgba(74,222,128,0.15)',color:'#4ade80',fontWeight:600}}>
                  ● {matchedVm.state || matchedVm.status || 'running'}
                </span>
              </div>
              <Link href="/vms" style={{fontSize:11,color:'#818cf8',textDecoration:'none',fontWeight:600,display:'inline-flex',alignItems:'center',gap:4}}>
                <span>Открыть в разделе ВМ</span>
                <span>→</span>
              </Link>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:10}}>
              <div style={{background:'#090d16',borderRadius:6,padding:10,border:'1px solid #1e293b'}}>
                <div style={{fontSize:10,color:'#9aa4b2',marginBottom:2}}>Физический гипервизор</div>
                <div style={{fontSize:13,fontWeight:600,color:'#fff'}}>{matchedVm.source_name || 'VM-SSV'}</div>
                <div style={{fontSize:11,color:'#818cf8',marginTop:2}}>ESXi 6.7.0 (192.168.18.222)</div>
              </div>
              <div style={{background:'#090d16',borderRadius:6,padding:10,border:'1px solid #1e293b'}}>
                <div style={{fontSize:10,color:'#9aa4b2',marginBottom:2}}>Виртуальная машина (Guest)</div>
                <div style={{fontSize:13,fontWeight:600,color:'#fff'}}>{matchedVm.name}</div>
                <div style={{fontSize:11,color:'#9aa4b2',marginTop:2}}>{matchedVm.os || 'Ubuntu Linux (64-bit)'}</div>
              </div>
              <div style={{background:'#090d16',borderRadius:6,padding:10,border:'1px solid #1e293b'}}>
                <div style={{fontSize:10,color:'#9aa4b2',marginBottom:2}}>Выделенные ресурсы ESXi</div>
                <div style={{fontSize:13,fontWeight:600,color:'#38bdf8'}}>
                  {matchedVm.cpu_count || '—'} vCPU · {matchedVm.ram_mb ? `${Math.round(matchedVm.ram_mb / 1024)} GB` : '—'} RAM
                </div>
                <div style={{fontSize:11,color:'#9aa4b2',marginTop:2}}>
                  {matchedVm.disk_gb ? `Диск: ${matchedVm.disk_gb} GB` : 'Хранилище: Datastore1'}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
      {serverUptime && (
        <div className="card" style={{padding:'12px 16px'}}>
          <div style={{fontSize:10,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.5,marginBottom:10}}>Uptime</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
            {[['24 часа','uptime_24h'],['7 дней','uptime_7d'],['30 дней','uptime_30d']].map(([label,key])=>{
              const pct = serverUptime[key]
              const color = pct==null?'#9aa4b2':pct>=99.9?'#4ade80':pct>=99.0?'#facc15':'#ef4444'
              return (
                <div key={key} style={{textAlign:'center',padding:'10px 6px',background:'#090d16',borderRadius:6}}>
                  <div style={{fontSize:16,fontWeight:700,color}}>{pct!=null?pct.toFixed(2)+'%':'—'}</div>
                  <div style={{fontSize:10,color:'#9aa4b2',marginTop:3}}>{label}</div>
                </div>
              )
            })}
          </div>
          {(serverUptime.color_30d === 'yellow' || serverUptime.color_30d === 'red') && (
            <div style={{marginTop:8,fontSize:11,color:serverUptime.color_30d==='red'?'#ef4444':'#facc15'}}>
              SLA нарушение за 30д: uptime ниже {serverUptime.color_30d==='red'?'99%':'99.9%'}
            </div>
          )}
        </div>
      )}
      {/* Дополнительные оперативные показатели */}
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:600,color:'#94a3b8',textTransform:'uppercase',letterSpacing:0.5}}>Оперативные показатели</div>
          <button
            onClick={() => setShowMiniMetrics(v => !v)}
            style={{background:'transparent',border:'none',color:'#64748b',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',gap:4}}>
            {showMiniMetrics ? <EyeOff size={12}/> : <Eye size={12}/>}
            <span>{showMiniMetrics ? 'Скрыть панель' : 'Показать панель'}</span>
          </button>
        </div>
        {showMiniMetrics && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:8}}>
            {MINI_CARDS.map(({label,key,color,unit})=>(
              <div key={key} className="card" style={{padding:'8px 10px',background:'#101726',border:'1px solid #1e293b'}}>
                <div style={{fontSize:10,color:'#9aa4b2',marginBottom:2}}>{label}</div>
                <div style={{fontSize:17,fontWeight:700,color}}>{curMetrics[key]?.value!=null?typeof curMetrics[key].value==='number'?curMetrics[key].value.toFixed(curMetrics[key].value<10?2:1):curMetrics[key].value:'—'}</div>
                {unit && <div style={{fontSize:9,color:'#64748b'}}>{unit}</div>}
                <MiniChart data={chartSeries.slice(-30)} dataKey={key} color={color} height={26}/>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ПАНЕЛЬ УПРАВЛЕНИЯ И КОМПАКТИЗАЦИИ ДИАГРАММ */}
      <div className="card" style={{padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',background:'#101726',border:'1px solid #1e293b'}}>
        <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <Activity size={15} style={{color:'#38bdf8'}}/>
            <span style={{fontSize:13,fontWeight:700,color:'#fff'}}>Телеметрия & Графики</span>
            <span style={{fontSize:10,color:'#64748b',background:'#090d16',padding:'2px 6px',borderRadius:4,border:'1px solid #1e293b'}}>{chartSeries.length} точек</span>
          </div>

          {/* Фильтр разделов диаграмм */}
          <div style={{display:'inline-flex',background:'#090d16',borderRadius:6,border:'1px solid #1e293b',padding:2}}>
            {[
              {id:'all', label:'Все графики (6)'},
              {id:'compute', label:'CPU & RAM'},
              {id:'network', label:'Сеть & Пинг'},
              {id:'disk', label:'Диски & IOPS'},
              {id:'unified', label:'Сводный мульти-график'},
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setOverviewChartFilter(f.id)}
                style={{
                  background: overviewChartFilter === f.id ? '#1e293b' : 'transparent',
                  border: 'none',
                  color: overviewChartFilter === f.id ? '#38bdf8' : '#94a3b8',
                  padding: '4px 9px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: overviewChartFilter === f.id ? 600 : 400,
                  transition: 'all 0.15s ease',
                }}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {/* Переключатель сетки (Колонки) */}
          <div style={{display:'inline-flex',background:'#090d16',borderRadius:6,border:'1px solid #1e293b',padding:2}}>
            <button
              onClick={() => setOverviewGridColumns(2)}
              title="2 Колонки (Сбалансированная сетка)"
              style={{
                background: overviewGridColumns === 2 ? '#1e293b' : 'transparent',
                border: 'none',
                color: overviewGridColumns === 2 ? '#38bdf8' : '#64748b',
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
              }}>
              2 кол.
            </button>
            <button
              onClick={() => setOverviewGridColumns(3)}
              title="3 Колонки (Компактный дашборд — все диаграммы в одном экране)"
              style={{
                background: overviewGridColumns === 3 ? '#1e293b' : 'transparent',
                border: 'none',
                color: overviewGridColumns === 3 ? '#38bdf8' : '#64748b',
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
              }}>
              3 кол. (Компакт)
            </button>
            <button
              onClick={() => setOverviewGridColumns(1)}
              title="1 Колонка (Широкие диаграммы)"
              style={{
                background: overviewGridColumns === 1 ? '#1e293b' : 'transparent',
                border: 'none',
                color: overviewGridColumns === 1 ? '#38bdf8' : '#64748b',
                padding: '3px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
              }}>
              1 кол.
            </button>
          </div>

          {/* Глобальный тип диаграмм (Area / Line / Bar) */}
          <div style={{display:'inline-flex',background:'#090d16',borderRadius:6,border:'1px solid #1e293b',padding:2}}>
            {['area', 'line', 'bar'].map(t => (
              <button
                key={t}
                onClick={() => setGlobalChartType(t)}
                title={`Переключить графики в режим ${t.toUpperCase()}`}
                style={{
                  background: globalChartType === t ? '#1e293b' : 'transparent',
                  border: 'none',
                  color: globalChartType === t ? '#38bdf8' : '#64748b',
                  padding: '3px 7px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ОТОБРАЖЕНИЕ ДИАГРАММ */}
      {overviewChartFilter === 'unified' ? (
        <MultiMetricChart
          data={chartSeries}
          height={320}
          onMaximize={() => setZoomedChart({type:'multi', title:'Сводный монитор ресурсов'})}
        />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: overviewGridColumns === 3 ? 'repeat(3, 1fr)' : overviewGridColumns === 1 ? '1fr' : 'repeat(2, 1fr)',
          gap: 12,
        }}>
          {(overviewChartFilter === 'all' || overviewChartFilter === 'compute') && (
            <>
              <BigChart
                data={chartSeries}
                dataKey="cpu"
                color="#2563eb"
                title="CPU %"
                unit="%"
                height={overviewGridColumns === 3 ? 150 : 170}
                defaultChartType={globalChartType}
                onMaximize={() => setZoomedChart({type:'single', dataKey:'cpu', color:'#2563eb', title:'CPU %', unit:'%'})}
              />
              <BigChart
                data={chartSeries}
                dataKey="ram"
                color="#00d4ff"
                title="RAM %"
                unit="%"
                height={overviewGridColumns === 3 ? 150 : 170}
                defaultChartType={globalChartType}
                onMaximize={() => setZoomedChart({type:'single', dataKey:'ram', color:'#00d4ff', title:'RAM %', unit:'%'})}
              />
            </>
          )}

          {(overviewChartFilter === 'all' || overviewChartFilter === 'network') && (
            <>
              <DualLineChart
                data={chartSeries}
                key1="net_in"
                key2="net_out"
                color1="#22d3ee"
                color2="#f472b6"
                label1="Входящий (In)"
                label2="Исходящий (Out)"
                title="Сетевой трафик"
                unit="Mbps"
                height={overviewGridColumns === 3 ? 150 : 170}
                defaultChartType={globalChartType}
                onMaximize={() => setZoomedChart({type:'dual', key1:'net_in', key2:'net_out', color1:'#22d3ee', color2:'#f472b6', label1:'Входящий (In)', label2:'Исходящий (Out)', title:'Сетевой трафик', unit:'Mbps'})}
              />
              <BigChart
                data={chartSeries}
                dataKey="ping"
                color="#4ade80"
                title="Пинг (Latency)"
                unit="мс"
                height={overviewGridColumns === 3 ? 150 : 170}
                defaultChartType={globalChartType}
                onMaximize={() => setZoomedChart({type:'single', dataKey:'ping', color:'#4ade80', title:'Пинг (Latency)', unit:'мс'})}
              />
            </>
          )}

          {(overviewChartFilter === 'all' || overviewChartFilter === 'disk') && (
            <>
              <BigChart
                data={chartSeries}
                dataKey="disk"
                color="#facc15"
                title="Диск %"
                unit="%"
                height={overviewGridColumns === 3 ? 150 : 170}
                defaultChartType={globalChartType}
                onMaximize={() => setZoomedChart({type:'single', dataKey:'disk', color:'#facc15', title:'Диск %', unit:'%'})}
              />
              <DualLineChart
                data={chartSeries}
                key1="iops_read"
                key2="iops_write"
                color1="#fbbf24"
                color2="#fb923c"
                label1="Чтение (Read)"
                label2="Запись (Write)"
                title="IOPS Диска"
                unit="IO/s"
                height={overviewGridColumns === 3 ? 150 : 170}
                defaultChartType={globalChartType}
                onMaximize={() => setZoomedChart({type:'dual', key1:'iops_read', key2:'iops_write', color1:'#fbbf24', color2:'#fb923c', label1:'Чтение (Read)', label2:'Запись (Write)', title:'IOPS Диска', unit:'IO/s'})}
              />
            </>
          )}

          {overviewChartFilter === 'compute' && (
            <DualLineChart
              data={chartSeries}
              key1="load1"
              key2="load15"
              color1="#a78bfa"
              color2="#6366f1"
              label1="Load 1m"
              label2="Load 15m"
              title="Load Average"
              unit=""
              height={overviewGridColumns === 3 ? 150 : 170}
              defaultChartType={globalChartType}
              onMaximize={() => setZoomedChart({type:'dual', key1:'load1', key2:'load15', color1:'#a78bfa', color2:'#6366f1', label1:'Load 1m', label2:'Load 15m', title:'Load Average', unit:''})}
            />
          )}
        </div>
      )}
    </>)
  }

  function renderCPU() {
    const cpu = agentData?.cpu_detail || {}
    const perCore = cpu.per_core || []
    return (<>
      <div className="card" style={{padding:16}}>
        <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>CPU Детали</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
          <InfoRow label="Загрузка" value={`${cpu.percent||curMetrics.cpu?.value||0}%`} color={cpu.percent>80?'#ef4444':'#4ade80'}/>
          <InfoRow label="Физ. ядра" value={cpu.cores_physical}/>
          <InfoRow label="Лог. ядра" value={cpu.cores_logical}/>
          <InfoRow label="Частота" value={cpu.freq_current?`${cpu.freq_current} MHz`:'—'}/>
          <InfoRow label="User" value={`${cpu.user||0}%`}/>
          <InfoRow label="System" value={`${cpu.system||0}%`}/>
          <InfoRow label="Idle" value={`${cpu.idle||0}%`}/>
          <InfoRow label="IO Wait" value={`${cpu.iowait||0}%`}/>
          <InfoRow label="Ctx Switches" value={cpu.ctx_switches?.toLocaleString()}/>
          <InfoRow label="Interrupts" value={cpu.interrupts?.toLocaleString()}/>
          <InfoRow label="Мин. частота" value={cpu.freq_min?`${cpu.freq_min} MHz`:'—'}/>
          <InfoRow label="Макс. частота" value={cpu.freq_max?`${cpu.freq_max} MHz`:'—'}/>
        </div>
      </div>
      {perCore.length>0 && (
        <div className="card" style={{padding:16}}>
          <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Загрузка по ядрам</h4>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(50px,1fr))',gap:6}}>
            {perCore.map((v,i)=>(
              <div key={i} style={{textAlign:'center'}}>
                <div style={{height:50,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
                  <div style={{width:24,height:`${Math.max(v,2)}%`,background:v>80?'#ef4444':v>60?'#facc15':'#2563eb',borderRadius:'3px 3px 0 0',transition:'height 0.4s'}}/>
                </div>
                <div style={{fontSize:9,color:'#fff',marginTop:2}}>{v}%</div>
                <div style={{fontSize:8,color:'#9aa4b2'}}>#{i}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      <BigChart data={chartSeries} dataKey="cpu" color="#2563eb" title="CPU % (история)" unit="%" height={200}/>
      <DualLineChart data={chartSeries} key1="load1" key2="load15" color1="#a78bfa" color2="#6366f1" label1="Load 1m" label2="Load 15m" title="Load Average" unit="" height={180}/>
    </>)
  }

  function renderMemory() {
    const ram = agentData?.ram_detail || {}
    const swap = agentData?.swap_detail || {}
    return (<>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div className="card" style={{padding:16}}>
          <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>RAM</h4>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <GaugeRing value={ram.percent||curMetrics.ram?.value||0} color="#00d4ff" label="RAM" size={90}/>
            <div style={{flex:1}}>
              <InfoRow label="Всего" value={ram.total_gb?`${ram.total_gb.toFixed(1)} GB`:'—'}/>
              <InfoRow label="Использовано" value={ram.used_gb?`${ram.used_gb.toFixed(1)} GB`:'—'} color="#ef4444"/>
              <InfoRow label="Свободно" value={ram.free_gb?`${ram.free_gb.toFixed(1)} GB`:'—'} color="#4ade80"/>
              <InfoRow label="Доступно" value={ram.available_gb?`${ram.available_gb.toFixed(1)} GB`:'—'}/>
              <InfoRow label="Кэш" value={ram.cached_gb?`${ram.cached_gb.toFixed(1)} GB`:'—'}/>
              <InfoRow label="Буферы" value={ram.buffers_gb?`${ram.buffers_gb.toFixed(1)} GB`:'—'}/>
            </div>
          </div>
        </div>
        <div className="card" style={{padding:16}}>
          <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Swap</h4>
          <div style={{display:'flex',alignItems:'center',gap:16}}>
            <GaugeRing value={swap.percent||curMetrics.swap?.value||0} color="#f97316" label="Swap" size={90}/>
            <div style={{flex:1}}>
              <InfoRow label="Всего" value={swap.total_gb?`${swap.total_gb.toFixed(1)} GB`:'—'}/>
              <InfoRow label="Использовано" value={swap.used_gb?`${swap.used_gb.toFixed(1)} GB`:'—'} color="#ef4444"/>
              <InfoRow label="Свободно" value={swap.free_gb?`${swap.free_gb.toFixed(1)} GB`:'—'} color="#4ade80"/>
            </div>
          </div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <BigChart data={chartSeries} dataKey="ram" color="#00d4ff" title="RAM % (история)" unit="%" height={180}/>
        <BigChart data={chartSeries} dataKey="swap" color="#f97316" title="Swap % (история)" unit="%" height={180}/>
      </div>
    </>)
  }

  function renderDisks() {
    const disks = agentData?.disks || []
    const dio = agentData?.disk_io || {}
    return (<>
      <div className="card" style={{padding:16}}>
        <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Разделы дисков</h4>
        <DataTable
          columns={[
            {key:'device',label:'Устройство'},
            {key:'mountpoint',label:'Точка монтирования'},
            {key:'fstype',label:'ФС'},
            {key:'total_gb',label:'Всего GB',render:r=>r.total_gb?.toFixed(1)},
            {key:'used_gb',label:'Занято GB',render:r=>r.used_gb?.toFixed(1)},
            {key:'free_gb',label:'Свободно GB',render:r=>r.free_gb?.toFixed(1),color:r=>r.free_gb<10?'#ef4444':'#4ade80'},
            {key:'percent',label:'Использование',render:r=><span style={{color:r.percent>90?'#ef4444':r.percent>70?'#facc15':'#4ade80',fontWeight:600}}>{r.percent}%</span>},
          ]}
          rows={disks}
          emptyText="Нет данных о дисках"
        />
      </div>
      {disks.length>0 && (
        <div className="card" style={{padding:16}}>
          <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Визуализация</h4>
          <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
            {disks.map((d,i)=><GaugeRing key={i} value={d.percent} color={d.percent>90?'#ef4444':'#facc15'} label={d.mountpoint} unit="%" size={70}/>)}
          </div>
        </div>
      )}
      <div className="card" style={{padding:16}}>
        <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Disk I/O</h4>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
          <InfoRow label="Скорость чтения" value={`${dio.read_mb_s?.toFixed(2)||0} MB/s`}/>
          <InfoRow label="Скорость записи" value={`${dio.write_mb_s?.toFixed(2)||0} MB/s`}/>
          <InfoRow label="IOPS Read" value={dio.iops_read||0}/>
          <InfoRow label="IOPS Write" value={dio.iops_write||0}/>
          <InfoRow label="Задержка чтения" value={`${dio.read_latency_ms?.toFixed(1)||0} мс`}/>
          <InfoRow label="Задержка записи" value={`${dio.write_latency_ms?.toFixed(1)||0} мс`}/>
        </div>
      </div>
      <DualLineChart data={chartSeries} key1="iops_read" key2="iops_write" color1="#fbbf24" color2="#fb923c" label1="Чтение" label2="Запись" title="IOPS (история)" unit="IO/s" height={180}/>
    </>)
  }

  function renderNetwork() {
    const ifaces = agentData?.network_interfaces || []
    const conns = agentData?.network_connections || {}
    const connByStatus = conns.by_status || {}
    return (<>
      <div className="card" style={{padding:16}}>
        <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Сетевые интерфейсы</h4>
        <DataTable
          columns={[
            {key:'name',label:'Интерфейс'},
            {key:'speed_in_mbps',label:'In Mbps',render:r=>r.speed_in_mbps?.toFixed(3),color:()=>'#22d3ee'},
            {key:'speed_out_mbps',label:'Out Mbps',render:r=>r.speed_out_mbps?.toFixed(3),color:()=>'#f472b6'},
            {key:'packets_recv',label:'Пакеты In',render:r=>r.packets_recv?.toLocaleString()},
            {key:'packets_sent',label:'Пакеты Out',render:r=>r.packets_sent?.toLocaleString()},
            {key:'errors_in',label:'Err In',color:r=>r.errors_in>0?'#ef4444':'#4ade80'},
            {key:'errors_out',label:'Err Out',color:r=>r.errors_out>0?'#ef4444':'#4ade80'},
            {key:'drops_in',label:'Drops In',color:r=>r.drops_in>0?'#ef4444':'#4ade80'},
            {key:'drops_out',label:'Drops Out',color:r=>r.drops_out>0?'#ef4444':'#4ade80'},
          ]}
          rows={ifaces}
        />
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div className="card" style={{padding:16}}>
          <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>TCP-соединения ({conns.total||0})</h4>
          {Object.entries(connByStatus).map(([st,cnt])=>(
            <InfoRow key={st} label={st} value={cnt} color={st==='ESTABLISHED'?'#4ade80':st==='TIME_WAIT'?'#facc15':'#9aa4b2'}/>
          ))}
          {Object.keys(connByStatus).length===0 && <div style={{color:'#9aa4b2',fontSize:12,padding:8}}>Нет данных</div>}
        </div>
        <DualLineChart data={chartSeries} key1="net_in" key2="net_out" color1="#22d3ee" color2="#f472b6" label1="In" label2="Out" title="Трафик (история)" unit="Mbps" height={200}/>
      </div>
    </>)
  }

  function renderProcesses() {
    const pd = agentData?.processes_detail || {}
    return (<>
      <div className="card" style={{padding:16}}>
        <div style={{display:'flex',gap:24}}>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:'#2563eb'}}>{pd.total||curMetrics.processes?.value||'—'}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Всего</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:pd.zombie>0?'#ef4444':'#4ade80'}}>{pd.zombie||0}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Zombie</div></div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <div className="card" style={{padding:16}}>
          <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Top по CPU</h4>
          <DataTable columns={[
            {key:'pid',label:'PID'},{key:'name',label:'Имя'},
            {key:'cpu',label:'CPU %',color:r=>r.cpu>50?'#ef4444':r.cpu>20?'#facc15':'#fff'},
            {key:'ram_mb',label:'RAM MB'},{key:'user',label:'User'},
          ]} rows={pd.top_cpu||[]}/>
        </div>
        <div className="card" style={{padding:16}}>
          <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Top по RAM</h4>
          <DataTable columns={[
            {key:'pid',label:'PID'},{key:'name',label:'Имя'},
            {key:'ram_mb',label:'RAM MB',color:r=>r.ram_mb>500?'#ef4444':r.ram_mb>200?'#facc15':'#fff'},
            {key:'cpu',label:'CPU %'},{key:'user',label:'User'},
          ]} rows={pd.top_ram||[]}/>
        </div>
      </div>
      <BigChart data={chartSeries} dataKey="processes" color="#06b6d4" title="Процессы (история)" unit="" height={160}/>
    </>)
  }

  function renderServices() {
    const services = agentData?.services || []
    const active = services.filter(s=>s.status==='active')
    const stopped = services.filter(s=>s.status!=='active')
    const filteredSvc = services.filter(s=>{
      if(svcFilter==='active' && s.status!=='active') return false
      if(svcFilter==='stopped' && s.status==='active') return false
      if(svcSearch.trim()) return (s.name||'').toLowerCase().includes(svcSearch.toLowerCase())
      return true
    })
    return (<>
      <div className="card" style={{padding:16}}>
        <div style={{display:'flex',gap:24}}>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:'#4ade80'}}>{active.length}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Работают</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:stopped.length>0?'#ef4444':'#9aa4b2'}}>{stopped.length}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Остановлены</div></div>
        </div>
      </div>
      <div className="card" style={{padding:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <h4 style={{margin:0,fontSize:14,color:'#fff'}}>Сервисы</h4>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <input value={svcSearch} onChange={e=>setSvcSearch(e.target.value)} placeholder="Поиск сервиса..." style={{padding:'4px 8px',borderRadius:4,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:11,width:160,outline:'none'}}/>
            {[{id:'all',l:'Все'},{id:'active',l:'Активные'},{id:'stopped',l:'Остановл.'}].map(f=>(
              <button key={f.id} onClick={()=>setSvcFilter(f.id)} style={{padding:'4px 8px',borderRadius:4,border:'none',cursor:'pointer',fontSize:10,fontWeight:600,background:svcFilter===f.id?'rgba(37, 99, 235, 0.15)':'#101726',color:svcFilter===f.id?'#2563eb':'#9aa4b2'}}>{f.l}</button>
            ))}
          </div>
        </div>
        {services.length===0 ? (
          <div style={{padding:20,textAlign:'center',color:'#9aa4b2',fontSize:12}}>Нет данных о сервисах (требуется агент)</div>
        ) : filteredSvc.length===0 ? (
          <div style={{padding:20,textAlign:'center',color:'#9aa4b2',fontSize:12}}>Ничего не найдено</div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:8}}>
            {filteredSvc.map((s,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'#090d16',borderRadius:6,borderLeft:`3px solid ${s.status==='active'?'#4ade80':s.status==='failed'?'#ef4444':'#ef444480'}`}}>
                <span style={{flex:1,fontSize:13,color:'#fff'}}>{s.name}</span>
                <StatusBadge status={s.status}/>
              </div>
            ))}
          </div>
        )}
        {svcSearch && <div style={{fontSize:10,color:'#9aa4b2',marginTop:6}}>Найдено: {filteredSvc.length} из {services.length}</div>}
      </div>
    </>)
  }

  function renderDocker() {
    const containers = agentData?.docker_containers
    if(!containers) return (
      <div className="card" style={{padding:40,textAlign:'center'}}>
        <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>🐳</div>
        <div style={{color:'#9aa4b2',fontSize:14}}>Docker не обнаружен на этом сервере</div>
        <div style={{color:'#9aa4b2',fontSize:12,marginTop:8}}>Установите Docker и модуль python docker на агенте</div>
      </div>
    )
    const running = containers.filter(c=>c.status==='running')
    const stopped = containers.filter(c=>c.status!=='running')
    return (<>
      <div className="card" style={{padding:16}}>
        <div style={{display:'flex',gap:24}}>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:'#00d4ff'}}>{containers.length}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Контейнеров</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:'#4ade80'}}>{running.length}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Работают</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:stopped.length?'#ef4444':'#9aa4b2'}}>{stopped.length}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Остановлены</div></div>
        </div>
      </div>
      <div className="card" style={{padding:16}}>
        <DataTable columns={[
          {key:'name',label:'Имя'},{key:'image',label:'Образ'},
          {key:'status',label:'Статус',render:r=><StatusBadge status={r.status}/>},
          {key:'cpu_percent',label:'CPU %',render:r=>r.cpu_percent?.toFixed(1),color:r=>r.cpu_percent>50?'#ef4444':'#fff'},
          {key:'mem_mb',label:'RAM MB',render:r=>r.mem_mb?.toFixed(0)},
          {key:'mem_percent',label:'RAM %',render:r=>r.mem_percent?.toFixed(1)},
          {key:'restarts',label:'Рестарты',color:r=>r.restarts>0?'#facc15':'#fff'},
        ]} rows={containers} emptyText="Нет контейнеров"/>
      </div>
    </>)
  }

  function renderSecurity() {
    const sec = agentData?.security || {}
    const ports = sec.open_ports || []
    const filteredPorts = portSearch.trim() ? ports.filter(p=>String(p).includes(portSearch.trim())) : ports
    return (<>
      <div className="card" style={{padding:16}}>
        <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Безопасность</h4>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:16}}>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:'#2563eb'}}>{ports.length}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Открытых портов</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:'#facc15'}}>{sec.active_users||0}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Пользователей</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:'#00d4ff'}}>{sec.active_ssh_sessions||0}</div><div style={{fontSize:11,color:'#9aa4b2'}}>SSH-сессий</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:'#38bdf8'}}>{sec.active_vpn_sessions||0}</div><div style={{fontSize:11,color:'#9aa4b2'}}>VPN-сессий</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:sec.failed_logins_24h>0?'#ef4444':'#4ade80'}}>{sec.failed_logins_24h||0}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Неуд. входов (24ч)</div></div>
        </div>
      </div>
      {ports.length>0 && (
        <div className="card" style={{padding:16}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <h4 style={{margin:0,fontSize:14,color:'#fff'}}>Порты (LISTEN)</h4>
            <input value={portSearch} onChange={e=>setPortSearch(e.target.value)} placeholder="🔍 Номер порта..." style={{padding:'4px 8px',borderRadius:4,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:11,width:140,outline:'none'}}/>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {filteredPorts.map(p=><span key={p} style={{padding:'4px 10px',background:'#1e293b',borderRadius:4,fontSize:12,color:[22,3389].includes(p)?'#facc15':[80,443,8080].includes(p)?'#4ade80':'#fff'}}>{p}</span>)}
            {filteredPorts.length===0 && <span style={{color:'#9aa4b2',fontSize:12}}>Порт не найден</span>}
          </div>
          {portSearch && <div style={{fontSize:10,color:'#9aa4b2',marginTop:6}}>Найдено: {filteredPorts.length} из {ports.length}</div>}
        </div>
      )}
    </>)
  }

  function renderLogs() {
    const logs = agentData?.recent_logs || {}
    const entries = logs[logTab] || []
    const filteredEntries = logSearch.trim() ? entries.filter(l=>l.toLowerCase().includes(logSearch.toLowerCase())) : entries
    return (<>
      <div className="card" style={{padding:16}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{display:'flex',gap:8}}>
            {[{k:'system',l:'System',c:'#2563eb'},{k:'auth',l:'Auth/Security',c:'#ef4444'},{k:'error',l:'Error/Kernel',c:'#facc15'}].map(t=>(
              <button key={t.k} onClick={()=>setLogTab(t.k)} style={{padding:'6px 14px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:logTab===t.k?t.c+'30':'#1e293b',color:logTab===t.k?t.c:'#9aa4b2'}}>{t.l}</button>
            ))}
          </div>
          <input value={logSearch} onChange={e=>setLogSearch(e.target.value)} placeholder="Поиск в логах..." style={{padding:'4px 8px',borderRadius:4,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:11,width:200,outline:'none'}}/>
        </div>
        {entries.length===0 ? (
          <div style={{padding:30,textAlign:'center',color:'#9aa4b2',fontSize:12}}>Нет логов. Агент ещё не прислал данные или нет прав на чтение журнала.</div>
        ) : filteredEntries.length===0 ? (
          <div style={{padding:30,textAlign:'center',color:'#9aa4b2',fontSize:12}}>Ничего не найдено по запросу "{logSearch}"</div>
        ) : (
          <div style={{maxHeight:400,overflowY:'auto',fontFamily:'monospace',fontSize:11,lineHeight:1.6}}>
            {filteredEntries.map((line,i)=>(
              <div key={i} style={{padding:'2px 0',color:line.toLowerCase().includes('error')||line.toLowerCase().includes('fail')?'#ef4444':line.toLowerCase().includes('warn')?'#facc15':'#c8d1dc',borderBottom:'1px solid #1e293b'}}>{line}</div>
            ))}
          </div>
        )}
        {logSearch && <div style={{fontSize:10,color:'#9aa4b2',marginTop:6}}>Найдено: {filteredEntries.length} из {entries.length}</div>}
      </div>
    </>)
  }

  function renderSystem() {
    const info = agentData?.system_info || {}
    const temps = agentData?.temperatures || []
    return (<>
      <div className="card" style={{padding:16}}>
        <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Информация о системе</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <InfoRow label="ID" value={selServer?.id}/>
          <InfoRow label="Имя" value={selServer?.name}/>
          <InfoRow label="Host" value={selServer?.host}/>
          <InfoRow label="Статус" value={selServer?.status} color={selServer?.status==='ok'?'#4ade80':'#ef4444'}/>
          <InfoRow label="ОС" value={info.os}/>
          <InfoRow label="Версия ОС" value={info.os_version}/>
          <InfoRow label="Ядро" value={info.kernel}/>
          <InfoRow label="Hostname" value={info.hostname}/>
          <InfoRow label="Архитектура" value={info.architecture}/>
          <InfoRow label="Python" value={info.python_version}/>
          <InfoRow label="Загрузка системы" value={info.boot_time}/>
          <InfoRow label="Аптайм" value={info.uptime_hours?`${info.uptime_hours} ч`:'—'}/>
        </div>
      </div>
      {temps.length>0 && (
        <div className="card" style={{padding:16}}>
          <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Температура</h4>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8}}>
            {temps.map((t,i)=>(
              <div key={i} style={{padding:10,background:'#090d16',borderRadius:6}}>
                <div style={{fontSize:11,color:'#9aa4b2'}}>{t.label}</div>
                <div style={{fontSize:20,fontWeight:700,color:t.current>(t.high||80)?'#ef4444':t.current>(t.high||80)*0.8?'#facc15':'#4ade80'}}>{t.current}°C</div>
                {t.high && <div style={{fontSize:10,color:'#9aa4b2'}}>Макс: {t.high}°C</div>}
                {t.critical && <div style={{fontSize:10,color:'#ef4444'}}>Крит: {t.critical}°C</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>)
  }

  function renderDatabases() {
    const databases = agentData?.databases || []
    return (
      <div className="card" style={{padding:16}}>
        <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Мониторинг СУБД</h4>
        <DataTable columns={[
          {key:'name',label:'База данных'},
          {key:'type',label:'Тип'},
          {key:'status',label:'Статус',render:r=><StatusBadge status={r.status}/>},
          {key:'latency_ms',label:'Задержка',render:r=>`${r.latency_ms?.toFixed(2)} мс`},
        ]} rows={databases} emptyText="Нет отслеживаемых баз данных (настройте MONITOR_DATABASES на агенте)"/>
      </div>
    )
  }

  function renderNetworkEquipment() {
    const equip = agentData?.network_equipment || []
    return (
      <div className="card" style={{padding:16}}>
        <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>Сетевое оборудование</h4>
        <DataTable columns={[
          {key:'name',label:'Название'},
          {key:'ip',label:'IP адрес'},
          {key:'status',label:'Статус',render:r=><StatusBadge status={r.status==='up'?'running':'exited'}/>},
          {key:'latency_ms',label:'Задержка',render:r=>`${r.latency_ms?.toFixed(2)} мс`},
        ]} rows={equip} emptyText="Нет отслеживаемого оборудования (настройте MONITOR_NET_EQUIP на агенте)"/>
      </div>
    )
  }

  function renderSSLCertificates() {
    const certs = agentData?.ssl_certificates || []
    return (
      <div className="card" style={{padding:16}}>
        <h4 style={{margin:'0 0 12px',fontSize:14,color:'#fff'}}>SSL сертификаты</h4>
        <DataTable columns={[
          {key:'domain',label:'Домен'},
          {key:'status',label:'Статус',render:r=><StatusBadge status={r.status==='valid'?'active':'inactive'}/>},
          {key:'days_left',label:'Осталось дней',color:r=>r.days_left<15?'#ef4444':'#fff'},
          {key:'issuer',label:'Издатель'},
          {key:'expires_at',label:'Истекает'},
        ]} rows={certs} emptyText="Нет отслеживаемых SSL-доменов (настройте MONITOR_SSL_DOMAINS на агенте)"/>
      </div>
    )
  }

  const tabRenderers = { 
    overview: renderOverview, 
    cpu: renderCPU, 
    memory: renderMemory, 
    disks: renderDisks, 
    network: renderNetwork, 
    processes: renderProcesses, 
    services: renderServices, 
    docker: renderDocker, 
    security: renderSecurity, 
    logs: renderLogs, 
    system: renderSystem,
    databases: renderDatabases,
    network_equipment: renderNetworkEquipment,
    ssl_certificates: renderSSLCertificates
  }

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page" style={{maxWidth:'100%',overflow:'auto'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h1 style={{margin:0}}>Серверы</h1>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#9aa4b2'}}>Всего: {servers.length}</span>
              <span style={{fontSize:12,color:'#4ade80'}}>{servers.filter(s=>s.status==='ok').length} онлайн</span>
              <span style={{fontSize:12,color:'#ef4444'}}>{servers.filter(s=>s.status==='down').length} оффлайн</span>
            </div>
          </div>
          <div style={{display:'flex',gap:16,minHeight:'calc(100vh - 120px)'}}>
            {/* Список серверов */}
            <div className="card" style={{width:260,minWidth:260,padding:12,alignSelf:'flex-start',position:'sticky',top:16}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <h4 style={{margin:0,fontSize:14}}>Серверы</h4>
                <button onClick={()=>{setShowModal(true);setModalTab('agent')}} style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:4,padding:'3px 10px',cursor:'pointer',fontSize:11,fontWeight:600}}>+ Добавить</button>
              </div>
              <input value={serverSearch} onChange={e=>setServerSearch(e.target.value)} placeholder="Поиск..." style={{width:'100%',padding:'5px 8px',borderRadius:4,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:11,marginBottom:6,outline:'none',boxSizing:'border-box'}}/>
              <div style={{display:'flex',gap:3,marginBottom:8}}>
                {[{id:'all',l:'Все'},{id:'ok',l:'Online'},{id:'down',l:'Offline'}].map(f=>(
                  <button key={f.id} onClick={()=>setServerStatusFilter(f.id)} style={{flex:1,padding:'3px 0',borderRadius:4,border:'none',cursor:'pointer',fontSize:10,fontWeight:600,background:serverStatusFilter===f.id?'rgba(37, 99, 235, 0.15)':'#101726',color:serverStatusFilter===f.id?'#2563eb':'#9aa4b2'}}>{f.l}</button>
                ))}
              </div>
              {loading && <div style={{color:'#9aa4b2',fontSize:12,padding:12}}>Загрузка...</div>}
              {error && <div style={{color:'#ef4444',fontSize:12,padding:8}}>{error}</div>}
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {servers.filter(s=>{
                  if(serverStatusFilter!=='all' && s.status!==serverStatusFilter) return false
                  if(serverSearch.trim()) {
                    const q = serverSearch.toLowerCase()
                    return (s.name||'').toLowerCase().includes(q) || (s.host||'').toLowerCase().includes(q) || (s.id||'').toLowerCase().includes(q)
                  }
                  return true
                }).map(s=>{
                  const isSel = selected?.id===s.id
                  const sM = s.last_metrics||{}
                  return (
                    <div key={s.id} onClick={()=>{setSelected(s);setActiveTab('overview');loadMetrics(s.id);loadServerUptime(s.id);setServerUptime(null)}} style={{display:'flex',alignItems:'center',gap:4,padding:'8px 10px',borderRadius:6,cursor:'pointer',background:isSel?'#2563eb20':'transparent',border:isSel?'1px solid #2563eb40':'1px solid transparent',transition:'all 0.15s'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                          <span style={{fontSize:13,color:'#fff',fontWeight:isSel?600:400,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{s.name}</span>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            {s.agent_key_count > 0 && (
                              <span style={{fontSize:10,padding:'1px 6px',borderRadius:999,background:'#4ade8022',color:'#4ade80'}}>{s.agent_key_count} ключ</span>
                            )}
                            <StatusBadge status={s.status}/>
                          </div>
                        </div>
                        <div style={{fontSize:10,color:'#9aa4b2'}}>{s.host||'no host'} <span style={{fontSize:9,padding:'1px 4px',borderRadius:3,background:s.monitor_type==='ssh'?'#00b89422':s.monitor_type==='winrm'?'#0984e322':s.monitor_type==='ping_only'?'#f39c1222':'#2563eb22',color:s.monitor_type==='ssh'?'#00b894':s.monitor_type==='winrm'?'#0984e3':s.monitor_type==='ping_only'?'#f39c12':'#a29bfe',marginLeft:4}}>{s.monitor_type==='ssh'?'SSH':s.monitor_type==='winrm'?'WinRM':s.monitor_type==='ping_only'?'Ping':s.monitor_type==='agent'?'Agent':'Agent'}</span></div>
                        {(() => {
                          const sVm = findMatchedVm(s, vms)
                          if (!sVm) return null
                          return (
                            <div style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:3,padding:'1px 6px',borderRadius:4,background:'rgba(99,102,241,0.12)',border:'1px solid rgba(99,102,241,0.25)',color:'#a5b4fc',fontSize:9}}>
                              <span>🧩</span>
                              <span>VMware: {sVm.source_name || 'VM-SSV'}</span>
                            </div>
                          )
                        })()}
                        {sM.cpu && <div style={{display:'flex',gap:8,marginTop:4,fontSize:9,color:'#9aa4b2'}}><span>CPU {sM.cpu.value}%</span><span>RAM {sM.ram?.value}%</span><span>Disk {sM.disk?.value}%</span></div>}
                      </div>
                      <button onClick={e=>{e.stopPropagation();handleDeleteServer(s.id)}} title="Удалить" style={{background:'none',border:'none',color:'#ef4444',cursor:'pointer',fontSize:12,padding:2,opacity:0.4}}>✕</button>
                    </div>
                  )
                })}
              </div>
            </div>
            {/* Панель деталей */}
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:14,minWidth:0}}>
              {!selected ? (
                <div className="card" style={{padding:60,textAlign:'center'}}>
                  <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>🖥️</div>
                  <div style={{color:'#9aa4b2',fontSize:15}}>Выберите сервер из списка слева</div>
                </div>
              ) : selServer?.monitor_type === 'ping_only' ? (<>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div><h2 style={{margin:0,fontSize:20}}>{selServer?.name}</h2><span style={{fontSize:12,color:'#9aa4b2'}}>{selServer?.host} · {selServer?.id} · <span style={{padding:'2px 6px',borderRadius:3,background:'#f39c1222',color:'#f39c12',fontSize:10}}>Ping</span></span></div>
                  <StatusBadge status={selServer?.status}/>
                </div>
                <div className="card" style={{padding:24,textAlign:'center'}}>
                  <div style={{fontSize:11,color:'#9aa4b2',textTransform:'uppercase',letterSpacing:0.5,marginBottom:16}}>Мониторинг пинга</div>
                  <div style={{display:'flex',justifyContent:'center',gap:40,marginBottom:20}}>
                    <GaugeRing value={curMetrics.ping?.value||0} max={500} color="#4ade80" label="Пинг" unit="мс"/>
                  </div>
                  <div style={{display:'flex',justifyContent:'center',gap:20}}>
                    <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:selServer?.status==='ok'?'#4ade80':'#ef4444'}}>{selServer?.status==='ok'?'Доступен':'Недоступен'}</div><div style={{fontSize:11,color:'#9aa4b2'}}>Статус</div></div>
                    <div style={{textAlign:'center'}}><div style={{fontSize:28,fontWeight:700,color:'#4ade80'}}>{curMetrics.ping?.value!=null?`${curMetrics.ping.value}`:' — '}</div><div style={{fontSize:11,color:'#9aa4b2'}}>мс</div></div>
                  </div>
                </div>
                <TimeRangeFilter onChange={handleTimeRangeChange} accent="#4ade80"/>
                <BigChart data={chartSeries} dataKey="ping" color="#4ade80" title="Пинг (история)" unit="мс" height={280}/>
              </>) : (<>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                      <h2 style={{margin:0,fontSize:20}}>{selServer?.name}</h2>
                      {(() => {
                        const selVm = findMatchedVm(selServer, vms)
                        if (!selVm) return null
                        return (
                          <Link href="/vms" style={{
                            display:'inline-flex',
                            alignItems:'center',
                            gap:5,
                            padding:'2px 8px',
                            borderRadius:6,
                            background:'rgba(99,102,241,0.15)',
                            border:'1px solid rgba(99,102,241,0.3)',
                            color:'#a5b4fc',
                            textDecoration:'none',
                            fontSize:11,
                            fontWeight:600,
                          }}>
                            <span>🧩 VMware: {selVm.source_name || 'VM-SSV'}</span>
                            <span style={{opacity:0.6}}>→</span>
                          </Link>
                        )
                      })()}
                    </div>
                    <span style={{fontSize:12,color:'#9aa4b2'}}>{selServer?.host} · {selServer?.id}</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    {selServer?.monitor_type === 'agent' && (<>
                      {agentData?.agent_version && (
                        <span title="Версия агента на этом сервере" style={{fontSize:11,padding:'3px 8px',borderRadius:6,background:'#22c55e18',color:'#22c55e',border:'1px solid #22c55e30',fontWeight:600}}>
                          v{agentData.agent_version}
                        </span>
                      )}
                      <button
                        onClick={() => handleUpgradeAgent(selServer.id)}
                        disabled={upgradingAgentId === selServer.id}
                        title="Обновить агент до актуальной версии"
                        style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',background:'#0284c720',color:'#38bdf8',border:'1px solid #0284c740',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:600,opacity:upgradingAgentId === selServer.id ? 0.6 : 1}}>
                        {upgradingAgentId === selServer.id ? '⏳ Обновление...' : '🔄 Обновить агент'}
                      </button>
                      <button onClick={() => { loadServerAgentKeys(selServer.id); setShowAgentKeysModal(true) }} style={{display:'flex',alignItems:'center',gap:5,padding:'5px 10px',background:'#2563eb20',color:'#a78bfa',border:'1px solid #2563eb40',borderRadius:6,cursor:'pointer',fontSize:11,fontWeight:600}}>
                        🔑 Ключи агента
                      </button>
                    </>)}
                    <StatusBadge status={selServer?.status}/>
                  </div>
                </div>
                <div style={{display:'flex',gap:4,overflowX:'auto',paddingBottom:4,marginTop:12}}>
                  {TABS.map(tab => {
                    const TabIcon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                          padding: '6px 11px',
                          borderRadius: 4,
                          border: `1px solid ${isActive ? '#2563eb' : '#1e293b'}`,
                          cursor: 'pointer',
                          fontSize: 11.5,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s',
                          background: isActive ? '#2563eb' : '#101726',
                          color: isActive ? '#ffffff' : '#94a3b8',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <TabIcon size={13} />
                        <span>{tab.label}</span>
                      </button>
                    )
                  })}
                </div>
                <TimeRangeFilter onChange={handleTimeRangeChange} accent="#2563eb"/>
                {tabRenderers[activeTab]?.()}
              </>)}
            </div>
          </div>
        </div>
      </div>
      {/* ── Agent keys modal ─────────────────────────────────────────────── */}
      {showAgentKeysModal && (
        <div onClick={() => setShowAgentKeysModal(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#101726',borderRadius:12,width:'100%',maxWidth:560,maxHeight:'85vh',overflow:'auto',border:'1px solid #1e293b',display:'flex',flexDirection:'column'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderBottom:'1px solid #1e293b',flexShrink:0}}>
              <span style={{fontSize:15,fontWeight:700,color:'#fff'}}>🔑 Ключи агента — {selServer?.name}</span>
              <button onClick={() => setShowAgentKeysModal(false)} style={{background:'none',border:'none',color:'#9aa4b2',fontSize:20,cursor:'pointer',lineHeight:1}}>✕</button>
            </div>
            <div style={{padding:20,display:'flex',flexDirection:'column',gap:14}}>
              <div style={{display:'flex',gap:8}}>
                <button onClick={handleCreateAgentKey} disabled={selectedKeyLoading} style={{background:'#2563eb',color:'#fff',border:'none',borderRadius:6,padding:'8px 14px',cursor:'pointer',fontSize:12,fontWeight:600,opacity:selectedKeyLoading?0.7:1}}>
                  {selectedKeyLoading ? 'Генерация...' : '+ Сгенерировать ключ'}
                </button>
                <button onClick={() => loadServerAgentKeys(selServer.id)} style={{background:'#0d1726',color:'#9aa4b2',border:'1px solid #1e293b',borderRadius:6,padding:'8px 14px',cursor:'pointer',fontSize:12}}>
                  ↻ Обновить
                </button>
              </div>
              {selectedAgentKey && (
                <div style={{background:'#101726',border:'1px solid #2563eb40',borderRadius:8,padding:12}}>
                  <div style={{fontSize:11,color:'#a78bfa',marginBottom:6,fontWeight:600}}>Новый ключ (сохраните — показывается один раз)</div>
                  <div style={{fontFamily:'monospace',fontSize:12,color:'#e2e8f0',wordBreak:'break-all',marginBottom:8}}>{selectedAgentKey}</div>
                  <button onClick={() => { navigator.clipboard.writeText(selectedAgentKey); setAgentCopied(true); setTimeout(() => setAgentCopied(false), 2000) }} style={{padding:'4px 10px',borderRadius:5,border:'none',background:'#2563eb',color:'#fff',cursor:'pointer',fontSize:11}}>{agentCopied ? '✓ Скопировано' : 'Копировать'}</button>
                </div>
              )}
              <div style={{background:'#090d16',border:'1px solid #1e293b',borderRadius:8,padding:12}}>
                <div style={{fontSize:11,color:'#9aa4b2',marginBottom:10,fontWeight:600}}>Ключи сервера</div>
                {selectedAgentKeys.length > 0 ? selectedAgentKeys.map(key => (
                  <div key={key.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',borderRadius:6,background:'#0d1726',marginBottom:6}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:'monospace',fontSize:11,color:'#e2e8f0',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{key.token}</div>
                      <div style={{display:'flex',gap:8,marginTop:3}}>
                        <span style={{fontSize:10,color:'#9aa4b2'}}>{new Date(key.created_at).toLocaleString()}</span>
                        <span style={{fontSize:10,color:key.is_active?'#4ade80':'#f87171'}}>{key.is_active ? 'Активен' : 'Отозван'}</span>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:6,marginLeft:12,flexShrink:0}}>
                      <button onClick={() => { navigator.clipboard.writeText(key.token); setAgentCopied(true); setTimeout(() => setAgentCopied(false), 2000) }} style={{padding:'4px 8px',borderRadius:5,border:'none',background:'#1f2937',color:'#9aa4b2',cursor:'pointer',fontSize:10}}>Копировать</button>
                      {key.is_active && (
                        <button onClick={() => handleRevokeAgentKey(key.id)} style={{padding:'4px 8px',borderRadius:5,border:'none',background:'#be123c',color:'#fff',cursor:'pointer',fontSize:10}}>Отозвать</button>
                      )}
                    </div>
                  </div>
                )) : (
                  <div style={{fontSize:12,color:'#9aa4b2'}}>Нет ключей. Нажмите «Сгенерировать ключ».</div>
                )}
              </div>
              {(selectedAgentKeys.length > 0 || selectedAgentKey) && (
                <div style={{background:'#090d16',border:'1px solid #1e293b',borderRadius:8,padding:12}}>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:8,fontWeight:600}}>Команда установки</div>
                  <pre style={{margin:0,whiteSpace:'pre-wrap',wordBreak:'break-all',fontSize:11,background:'#020d1a',border:'1px solid #1e293b',borderRadius:6,padding:10,color:'#c8d1dc'}}>{buildServerInstallCommand()}</pre>
                  <button onClick={() => { navigator.clipboard.writeText(buildServerInstallCommand()); setAgentCopied(true); setTimeout(() => setAgentCopied(false), 2000) }} style={{marginTop:8,padding:'5px 12px',borderRadius:6,border:'none',background:'#2563eb',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>{agentCopied ? '✓ Скопировано' : 'Копировать команду'}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Agent / Server install modal ─────────────────────────────────── */}
      {showModal && (
        <div onClick={closeModal} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.75)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div onClick={e=>e.stopPropagation()} style={{background:'#101726',borderRadius:12,width:'100%',maxWidth:660,maxHeight:'92vh',overflow:'auto',border:'1px solid #1e293b',display:'flex',flexDirection:'column'}}>

            {/* Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'18px 24px',borderBottom:'1px solid #1e293b',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:20}}>⬡</span>
                <span style={{fontSize:16,fontWeight:700,color:'#fff'}}>Добавить агент / сервер</span>
              </div>
              <button onClick={closeModal} style={{background:'none',border:'none',color:'#9aa4b2',fontSize:20,cursor:'pointer',lineHeight:1}}>✕</button>
            </div>

            {/* Tab bar */}
            <div style={{display:'flex',borderBottom:'1px solid #1e293b',flexShrink:0}}>
              {[{id:'agent',label:'🤖  Установить агент'},{id:'update',label:'🔄  Обновить агент'},{id:'server',label:'🖥️  Подключить сервер'}].map(t=>(
                <button key={t.id} onClick={()=>setModalTab(t.id)} style={{padding:'12px 22px',border:'none',cursor:'pointer',fontSize:13,fontWeight:600,background:'transparent',color:modalTab===t.id?'#a78bfa':'#9aa4b2',borderBottom:modalTab===t.id?'2px solid #2563eb':'2px solid transparent',transition:'all 0.15s'}}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── AGENT TAB ── */}
            {modalTab === 'agent' && (
              <div style={{padding:24,display:'flex',flexDirection:'column',gap:20}}>

                {/* Platform selector */}
                <div>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:8,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Операционная система</div>
                  <div style={{display:'flex',gap:8}}>
                    {[
                      {id:'windows',  icon:'🪟', label:'Windows'},
                      {id:'linux',    icon:'🐧', label:'Linux x64'},
                      {id:'linux-arm64', icon:'🐧', label:'Linux arm64'},
                    ].map(p=>(
                      <button key={p.id} onClick={()=>setAgentPlatform(p.id)} style={{flex:1,padding:'10px 8px',borderRadius:8,border:agentPlatform===p.id?'2px solid #2563eb':'2px solid #1e293b',background:agentPlatform===p.id?'#2563eb20':'#090d16',color:agentPlatform===p.id?'#a78bfa':'#9aa4b2',cursor:'pointer',fontSize:12,fontWeight:600,display:'flex',flexDirection:'column',alignItems:'center',gap:4,transition:'all 0.15s'}}>
                        <span style={{fontSize:22}}>{p.icon}</span>{p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Server fields */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4}}>Server ID <span style={{color:'#ef4444'}}>*</span></div>
                    <input value={agentForm.serverId} onChange={e=>setAgentForm({...agentForm,serverId:e.target.value.replace(/[^a-zA-Z0-9_\-.]/g,'-')})} placeholder="my-server-01" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                    <div style={{fontSize:10,color:'#9aa4b2',marginTop:3}}>Латиница, цифры, «-» «_» «.»</div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4}}>Отображаемое имя <span style={{color:'#ef4444'}}>*</span></div>
                    <input value={agentForm.name} onChange={e=>setAgentForm({...agentForm,name:e.target.value})} placeholder="Production Server" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4}}>Host / IP <span style={{color:'#9aa4b2',fontWeight:400}}>(опционально)</span></div>
                    <input value={agentForm.host} onChange={e=>setAgentForm({...agentForm,host:e.target.value})} placeholder="192.168.1.100" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4}}>Интервал сбора (сек)</div>
                    <input value={agentForm.interval} onChange={e=>setAgentForm({...agentForm,interval:e.target.value.replace(/\D/g,'')})} placeholder="15" style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  </div>
                  <div style={{gridColumn:'1 / -1',display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#9aa4b2'}}>
                    <input type="checkbox" checked={generateAgentToken} onChange={e=>setGenerateAgentToken(e.target.checked)} style={{width:16,height:16}}/>
                    <span>Генерировать уникальный ключ агента для этого сервера</span>
                  </div>
                </div>

                {/* Command block */}
                <div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <div style={{fontSize:11,color:'#9aa4b2',fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>
                      {agentPlatform==='windows' ? '💻 PowerShell (от имени Администратора)' : '💻 Bash'}
                    </div>
                    <button onClick={()=>{navigator.clipboard.writeText(buildInstallCommand());setAgentCopied(true);setTimeout(()=>setAgentCopied(false),2000)}}
                      style={{padding:'5px 12px',borderRadius:5,border:'none',background:agentCopied?'#4ade8030':'#1e293b',color:agentCopied?'#4ade80':'#9aa4b2',cursor:'pointer',fontSize:11,fontWeight:600,transition:'all 0.2s'}}>
                      {agentCopied ? '✓ Скопировано' : '📋 Копировать'}
                    </button>
                  </div>
                  <pre style={{background:'#020d1a',border:'1px solid #1e293b',borderRadius:8,padding:14,fontSize:11,color:'#c8d1dc',overflowX:'auto',whiteSpace:'pre-wrap',wordBreak:'break-all',margin:0,lineHeight:1.7,fontFamily:'Consolas,monospace'}}>
                    {buildInstallCommand()}
                  </pre>
                </div>

                {agentToken && (
                  <div style={{padding:14,border:'1px solid #1e293b',borderRadius:10,background:'#09111c',display:'flex',flexDirection:'column',gap:10}}>
                    <div style={{fontSize:11,color:'#9aa4b2'}}>Серверный токен агента создан. Используйте его при установке:</div>
                    <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                      <code style={{padding:'8px 10px',borderRadius:8,background:'#020d1a',border:'1px solid #1e293b',color:'#a78bfa',fontSize:12,overflowWrap:'anywhere'}}>{agentToken}</code>
                      <button onClick={()=>{navigator.clipboard.writeText(agentToken);setAgentCopied(true);setTimeout(()=>setAgentCopied(false),2000)}} style={{padding:'6px 12px',borderRadius:6,border:'none',background:'#2563eb',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>{agentCopied ? '✓ Скопировано' : 'Копировать токен'}</button>
                    </div>
                  </div>
                )}

                {/* Download buttons */}
                <div>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:8,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5}}>Скачать</div>
                  {agentPlatform === 'windows' ? (
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {/* GUI installer — primary */}
                      {(agentInfo.available_files||[]).includes('MonitoringAgentInstaller.exe') && (
                        <button onClick={()=>downloadAgentFile('MonitoringAgentInstaller.exe')}
                          style={{padding:'12px 18px',borderRadius:8,border:'2px solid #2563eb',background:'#2563eb20',color:'#a78bfa',cursor:'pointer',fontSize:13,fontWeight:700,display:'flex',alignItems:'center',gap:10,width:'100%'}}>
                          <span style={{fontSize:22}}>🪟</span>
                          <div style={{textAlign:'left'}}>
                            <div>MonitoringAgentInstaller.exe</div>
                            <div style={{fontSize:10,fontWeight:400,color:'#9aa4b2',marginTop:1}}>Установщик с графическим интерфейсом — скачайте и запустите</div>
                          </div>
                        </button>
                      )}
                      {/* Script fallback */}
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>downloadAgentFile('install.ps1')}
                          style={{padding:'7px 12px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#9aa4b2',cursor:'pointer',fontSize:11,fontWeight:600}}>
                          ⬇ install.ps1
                        </button>
                        {(agentInfo.available_files||[]).includes('MonitoringAgent.exe') && (
                          <button onClick={()=>downloadAgentFile('MonitoringAgent.exe')}
                            style={{padding:'7px 12px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#9aa4b2',cursor:'pointer',fontSize:11,fontWeight:600}}>
                            ⬇ MonitoringAgent.exe
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                      <button onClick={()=>downloadAgentFile('install.sh')}
                        style={{padding:'8px 14px',borderRadius:6,border:'1px solid #4ade8040',background:'#4ade8020',color:'#4ade80',cursor:'pointer',fontSize:12,fontWeight:600}}>
                        ⬇ install.sh
                      </button>
                      {(agentInfo.available_files||[]).includes(`monitoring-agent-linux-${agentPlatform==='linux-arm64'?'arm64':'amd64'}`) && (
                        <button onClick={()=>downloadAgentFile(`monitoring-agent-linux-${agentPlatform==='linux-arm64'?'arm64':'amd64'}`)}
                          style={{padding:'8px 14px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#9aa4b2',cursor:'pointer',fontSize:12,fontWeight:600}}>
                          ⬇ monitoring-agent-linux-{agentPlatform==='linux-arm64'?'arm64':'amd64'}
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{fontSize:10,color:'#9aa4b2',marginTop:6}}>Версия агента: <span style={{color:'#a78bfa'}}>{agentInfo.version}</span></div>
                </div>

                {/* Register button */}
                <div style={{borderTop:'1px solid #1e293b',paddingTop:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontSize:11,color:'#9aa4b2'}}>
                    {agentRegDone
                      ? <span style={{color:'#4ade80'}}>✓ Сервер зарегистрирован в системе</span>
                      : 'Зарегистрируйте сервер, чтобы он появился в списке до первого подключения агента'}
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    {!agentRegDone && (
                      <button onClick={handleRegisterAgent} disabled={agentRegLoading||!agentForm.serverId.trim()||!agentForm.name.trim()}
                        style={{padding:'8px 16px',borderRadius:6,border:'none',background:'#2563eb',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600,opacity:(agentRegLoading||!agentForm.serverId.trim()||!agentForm.name.trim())?0.5:1}}>
                        {agentRegLoading ? '...' : '+ Зарегистрировать'}
                      </button>
                    )}
                    <button onClick={closeModal} style={{padding:'8px 16px',borderRadius:6,border:'1px solid #1e293b',background:'transparent',color:'#9aa4b2',cursor:'pointer',fontSize:12,fontWeight:600}}>
                      Закрыть
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── UPDATE TAB ── */}
            {modalTab === 'update' && (
              <div style={{padding:24,display:'flex',flexDirection:'column',gap:20}}>
                <div style={{background:'#0284c715',border:'1px solid #0284c740',borderRadius:8,padding:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:'#38bdf8',marginBottom:4}}>⚡ Автоматическое обновление агентов</div>
                  <div style={{fontSize:12,color:'#c8d1dc',lineHeight:1.5}}>
                    Платформа поддерживает обновление агентов тремя способами: одной командой на целевом сервере, кнопкой в карточке сервера (через SSH или heartbeat), либо запуском команды обновления для всех подключенных агентов.
                  </div>
                </div>

                {/* Вариант 1: Команда на сервере */}
                <div>
                  <div style={{fontSize:12,color:'#fff',fontWeight:600,marginBottom:6}}>1. Обновление на Linux сервере (одной командой):</div>
                  <pre style={{margin:0,whiteSpace:'pre-wrap',wordBreak:'break-all',fontSize:11,background:'#020d1a',border:'1px solid #1e293b',borderRadius:6,padding:10,color:'#4ade80'}}>
                    {`curl -sSf http://${typeof window !== 'undefined' ? window.location.hostname : '192.168.17.50'}:9000/agent/update.sh | sudo bash`}
                  </pre>
                  <button onClick={()=>{
                    const cmd = `curl -sSf http://${window.location.hostname}:9000/agent/update.sh | sudo bash`
                    navigator.clipboard.writeText(cmd)
                    alert('✓ Команда скопирована в буфер обмена!')
                  }} style={{marginTop:8,padding:'6px 12px',borderRadius:6,border:'none',background:'#0284c7',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>
                    Копировать команду Linux
                  </button>
                </div>

                {/* Вариант 2: Windows */}
                <div>
                  <div style={{fontSize:12,color:'#fff',fontWeight:600,marginBottom:6}}>2. Обновление на Windows сервере (PowerShell):</div>
                  <pre style={{margin:0,whiteSpace:'pre-wrap',wordBreak:'break-all',fontSize:11,background:'#020d1a',border:'1px solid #1e293b',borderRadius:6,padding:10,color:'#38bdf8'}}>
                    {`irm http://${typeof window !== 'undefined' ? window.location.hostname : '192.168.17.50'}:9000/agent/update.ps1 | iex`}
                  </pre>
                  <button onClick={()=>{
                    const cmd = `irm http://${window.location.hostname}:9000/agent/update.ps1 | iex`
                    navigator.clipboard.writeText(cmd)
                    alert('✓ Команда скопирована в буфер обмена!')
                  }} style={{marginTop:8,padding:'6px 12px',borderRadius:6,border:'none',background:'#0284c7',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>
                    Копировать команду Windows
                  </button>
                </div>

                {/* Вариант 3: Массовое обновление */}
                <div style={{background:'#090d16',border:'1px solid #1e293b',borderRadius:8,padding:14}}>
                  <div style={{fontSize:12,color:'#fff',fontWeight:600,marginBottom:4}}>3. Централизованное обновление всех агентов:</div>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:12}}>
                    Отправляет сигнал обновления на все серверы. Каждый работающий агент скачает актуальный бинарник и перезапустится в течение 15–30 секунд.
                  </div>
                  <button onClick={handleUpgradeAllAgents} style={{padding:'8px 16px',borderRadius:6,border:'none',background:'#2563eb',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    🔄 Запланировать обновление для всех серверов
                  </button>
                </div>

                <div style={{display:'flex',justifyContent:'flex-end',borderTop:'1px solid #1e293b',paddingTop:14}}>
                  <button onClick={closeModal} style={{padding:'8px 16px',borderRadius:6,border:'1px solid #1e293b',background:'transparent',color:'#9aa4b2',cursor:'pointer',fontSize:12,fontWeight:600}}>
                    Закрыть
                  </button>
                </div>
              </div>
            )}

            {/* ── SERVER TAB ── */}
            {modalTab === 'server' && (
              <form onSubmit={handleAddServer} style={{padding:24,display:'flex',flexDirection:'column',gap:14}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                  <div>
                    <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4}}>Server ID <span style={{color:'#ef4444'}}>*</span></div>
                    <input placeholder="my-server" value={addForm.id} onChange={e=>setAddForm({...addForm,id:e.target.value})} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4}}>Имя <span style={{color:'#ef4444'}}>*</span></div>
                    <input placeholder="Production Server" value={addForm.name} onChange={e=>setAddForm({...addForm,name:e.target.value})} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4}}>Host / IP</div>
                  <input placeholder="192.168.1.100" value={addForm.host} onChange={e=>setAddForm({...addForm,host:e.target.value})} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                </div>
                <div>
                  <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4}}>Тип мониторинга</div>
                  <select value={addForm.monitor_type} onChange={e=>setAddForm({...addForm,monitor_type:e.target.value})} style={{width:'100%',padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none'}}>
                    <option value="agent">Агент (пассивный)</option>
                    <option value="ssh">SSH (Linux)</option>
                    <option value="winrm">WinRM (Windows)</option>
                    <option value="ping_only">Только пинг</option>
                  </select>
                </div>
                {addForm.monitor_type === 'ssh' && (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <input placeholder="SSH пользователь (root)" value={addForm.ssh_user} onChange={e=>setAddForm({...addForm,ssh_user:e.target.value})} style={{padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none'}}/>
                    <input placeholder="SSH порт (22)" value={addForm.ssh_port} onChange={e=>setAddForm({...addForm,ssh_port:e.target.value})} style={{padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none'}}/>
                    <input placeholder="Пароль SSH" type="password" value={addForm.ssh_password} onChange={e=>setAddForm({...addForm,ssh_password:e.target.value})} style={{padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none'}}/>
                    <input placeholder="Путь к SSH ключу" value={addForm.ssh_key_path} onChange={e=>setAddForm({...addForm,ssh_key_path:e.target.value})} style={{padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none'}}/>
                  </div>
                )}
                {addForm.monitor_type === 'winrm' && (
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <input placeholder="WinRM пользователь" value={addForm.winrm_user} onChange={e=>setAddForm({...addForm,winrm_user:e.target.value})} style={{padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none'}}/>
                    <input placeholder="Пароль WinRM" type="password" value={addForm.winrm_password} onChange={e=>setAddForm({...addForm,winrm_password:e.target.value})} style={{padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none'}}/>
                    <input placeholder="Порт (5985)" value={addForm.winrm_port} onChange={e=>setAddForm({...addForm,winrm_port:e.target.value})} style={{padding:'8px 10px',borderRadius:6,border:'1px solid #1e293b',background:'#090d16',color:'#fff',fontSize:12,outline:'none'}}/>
                    <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'#9aa4b2',padding:'8px 0'}}><input type="checkbox" checked={addForm.winrm_use_ssl} onChange={e=>setAddForm({...addForm,winrm_use_ssl:e.target.checked})}/> HTTPS (SSL)</label>
                  </div>
                )}
                {addError && <div style={{color:'#ef4444',fontSize:12,padding:'6px 10px',background:'#ef444420',borderRadius:5}}>{addError}</div>}
                <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:4}}>
                  <button type="button" onClick={closeModal} style={{padding:'8px 16px',borderRadius:6,border:'1px solid #1e293b',background:'transparent',color:'#9aa4b2',cursor:'pointer',fontSize:12,fontWeight:600}}>Отмена</button>
                  <button type="submit" disabled={addLoading} style={{padding:'8px 20px',borderRadius:6,border:'none',background:'#2563eb',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:600,opacity:addLoading?0.6:1}}>{addLoading?'Добавление...':'Добавить сервер'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Полноэкранный просмотр графика (Zoom Modal) */}
      {zoomedChart && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.82)',backdropFilter:'blur(6px)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div className="card" style={{width:'100%',maxWidth:960,background:'#101726',border:'1px solid #1e293b',padding:20,borderRadius:12,display:'flex',flexDirection:'column',gap:14,boxShadow:'0 25px 50px -12px rgba(0,0,0,0.7)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <h3 style={{margin:0,fontSize:17,fontWeight:700,color:'#fff'}}>{zoomedChart.title}</h3>
                <span style={{fontSize:11,color:'#94a3b8'}}>Детальный временной разрез за выбранный интервал ({chartSeries.length} точек)</span>
              </div>
              <button
                onClick={() => setZoomedChart(null)}
                style={{background:'#1e293b',border:'none',color:'#fff',padding:'6px 14px',borderRadius:6,cursor:'pointer',fontSize:12,fontWeight:600}}>
                ✕ Закрыть
              </button>
            </div>
            {zoomedChart.type === 'single' ? (
              <BigChart
                data={chartSeries}
                dataKey={zoomedChart.dataKey}
                color={zoomedChart.color}
                title={zoomedChart.title}
                unit={zoomedChart.unit}
                height={380}
                defaultChartType={globalChartType}
                showControls={true}
              />
            ) : zoomedChart.type === 'dual' ? (
              <DualLineChart
                data={chartSeries}
                key1={zoomedChart.key1}
                key2={zoomedChart.key2}
                color1={zoomedChart.color1}
                color2={zoomedChart.color2}
                label1={zoomedChart.label1}
                label2={zoomedChart.label2}
                title={zoomedChart.title}
                unit={zoomedChart.unit}
                height={380}
                defaultChartType={globalChartType}
                showControls={true}
              />
            ) : (
              <MultiMetricChart data={chartSeries} height={380}/>
            )}
          </div>
        </div>
      )}
    </ProtectedRoute>
  )
}
