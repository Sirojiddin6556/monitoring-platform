import {useState, useRef, useEffect} from 'react'

const PRESETS = [
  {id:'5m',  label:'5м',  ms: 5*60*1000},
  {id:'15m', label:'15м', ms: 15*60*1000},
  {id:'30m', label:'30м', ms: 30*60*1000},
  {id:'1h',  label:'1ч',  ms: 60*60*1000},
  {id:'3h',  label:'3ч',  ms: 3*60*60*1000},
  {id:'6h',  label:'6ч',  ms: 6*60*60*1000},
  {id:'12h', label:'12ч', ms: 12*60*60*1000},
  {id:'24h', label:'24ч', ms: 24*60*60*1000},
  {id:'all', label:'Все', ms: 0},
]

function pad(n) { return String(n).padStart(2,'0') }
function toLocalISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TimeRangeFilter({onChange, accent='#6366f1'}) {
  const [active, setActive] = useState('all')
  const [showCustom, setShowCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const popRef = useRef(null)

  useEffect(() => {
    function close(e) { if(popRef.current && !popRef.current.contains(e.target)) setShowCustom(false) }
    if(showCustom) document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showCustom])

  function selectPreset(p) {
    setActive(p.id)
    setShowCustom(false)
    if(p.ms === 0) {
      onChange({from: null, to: null, preset: 'all'})
    } else {
      const now = Date.now()
      onChange({from: now - p.ms, to: now, preset: p.id})
    }
  }

  function applyCustom() {
    if(!customFrom || !customTo) return
    const from = new Date(customFrom).getTime()
    const to = new Date(customTo).getTime()
    if(isNaN(from) || isNaN(to) || from >= to) return
    setActive('custom')
    setShowCustom(false)
    onChange({from, to, preset: 'custom'})
  }

  const btnBase = {
    padding:'4px 9px', borderRadius:6, border:'none',
    cursor:'pointer', fontSize:11, fontWeight:600,
    transition:'all 0.15s', fontFamily:'inherit', lineHeight:1,
  }

  return (
    <div style={{display:'flex',alignItems:'center',gap:3,position:'relative',flexWrap:'wrap'}}>
      <span style={{fontSize:11,color:'#4a5068',marginRight:3,userSelect:'none'}}>⏱</span>
      {PRESETS.map(p => (
        <button key={p.id} onClick={() => selectPreset(p)} style={{
          ...btnBase,
          background: active===p.id ? `${accent}22` : 'rgba(255,255,255,0.04)',
          color: active===p.id ? accent : '#6272a4',
          boxShadow: active===p.id ? `0 0 0 1px ${accent}50` : 'none',
        }}>{p.label}</button>
      ))}
      <div style={{position:'relative'}} ref={popRef}>
        <button onClick={() => {
          if(!showCustom) {
            const now = new Date()
            const from = new Date(now.getTime() - 3600000)
            if(!customFrom) setCustomFrom(toLocalISO(from))
            if(!customTo)   setCustomTo(toLocalISO(now))
          }
          setShowCustom(!showCustom)
        }} style={{
          ...btnBase,
          background: active==='custom' ? `${accent}22` : 'rgba(255,255,255,0.04)',
          color: active==='custom' ? accent : '#6272a4',
          boxShadow: active==='custom' ? `0 0 0 1px ${accent}50` : 'none',
        }}>📅 Период</button>

        {showCustom && (
          <div style={{
            position:'absolute', top:'calc(100% + 6px)', right:0, padding:14,
            background:'#0d0d24',
            border:'1px solid rgba(130,130,220,0.12)',
            borderRadius:10, zIndex:200,
            minWidth:268,
            boxShadow:'0 12px 36px rgba(0,0,0,0.5), 0 0 0 1px #1c1c3e',
          }}>
            <div style={{fontSize:11,color:'#8892a8',marginBottom:10,fontWeight:600,textTransform:'uppercase',letterSpacing:0.4}}>Выберите период</div>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              {[['С:', customFrom, setCustomFrom],['По:', customTo, setCustomTo]].map(([lbl,val,set])=>(
                <div key={lbl}>
                  <div style={{fontSize:10,color:'#4a5068',marginBottom:3}}>{lbl}</div>
                  <input type="datetime-local" value={val} onChange={e => set(e.target.value)}
                    style={{
                      width:'100%', padding:'6px 9px',
                      borderRadius:6, border:'1px solid #1c1c3e',
                      background:'#0b0b1e', color:'#e2e4f0',
                      fontSize:11, outline:'none', fontFamily:'inherit',
                    }}
                  />
                </div>
              ))}
              <button onClick={applyCustom} style={{
                marginTop:2, padding:'7px 12px',
                borderRadius:6, border:'none',
                background:`linear-gradient(135deg, ${accent}, #4f46e5)`,
                color:'#fff', cursor:'pointer',
                fontSize:11, fontWeight:700,
                fontFamily:'inherit',
                boxShadow:`0 0 12px ${accent}40`,
              }}>Применить</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
