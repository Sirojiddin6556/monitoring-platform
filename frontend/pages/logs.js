import {useEffect, useState} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

function normalizeLogEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) return []
  return rawEntries
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (entry == null) return ''
      try {
        return JSON.stringify(entry)
      } catch {
        return String(entry)
      }
    })
    .filter(Boolean)
}

function parseEventLine(line) {
  const src = String(line || '')
  const pattern = /Event\[(\d+)\]\s*\|\s*Log Name:\s*([^|]+)\|\s*Source:\s*([^|]+)\|\s*Id:\s*([^|]+)\|\s*Level:\s*([^|]+)\|\s*Date:\s*([^|]+)\|\s*Message:\s*(.*)$/i
  const m = src.match(pattern)
  if (!m) {
    return {
      raw: src,
      index: null,
      logName: null,
      source: null,
      eventId: null,
      level: null,
      date: null,
      message: src,
      parsed: false,
    }
  }
  return {
    raw: src,
    index: m[1],
    logName: m[2].trim(),
    source: m[3].trim(),
    eventId: m[4].trim(),
    level: m[5].trim(),
    date: m[6].trim(),
    message: m[7].trim(),
    parsed: true,
  }
}

function hasMojibakeText(s) {
  const text = String(s || '')
  if (!text) return false
  // Typical mojibake fragments from cp1251/cp866 mismatch.
  return /[ѓ„…†‡€‰‰Љ‹ЊЋЏђ‘’“”•–—™љњћџҐЁЄЇЎ]/.test(text)
}

export default function Logs() {
  const [servers, setServers] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [logTab, setLogTab] = useState('system')
  const [serverSearch, setServerSearch] = useState('')
  const [logSearch, setLogSearch] = useState('')
  const [expandedRows, setExpandedRows] = useState({})

  useEffect(() => {
    Promise.resolve().then(() => {
      apiFetch('/api/servers').then(d => { setServers(d.servers||[]); setLoading(false) }).catch(()=>setLoading(false))
    })
  }, [])

  function selectServer(s) {
    setSelected(s)
    setDetail(null)
    Promise.resolve().then(() => {
      apiFetch(`/api/servers/${s.id}/detail`).then(d => setDetail(d.detail||null)).catch(()=>setDetail(null))
    })
  }

  // auto-refresh logs every 20s
  useEffect(() => {
    if(!selected) return
    const iv = setInterval(() => {
      Promise.resolve().then(() => {
        apiFetch(`/api/servers/${selected.id}/detail`).then(d => setDetail(d.detail||null)).catch(()=>{})
      })
    }, 20000)
    return () => clearInterval(iv)
  }, [selected])

  const logs = detail?.recent_logs || {}
  const entries = normalizeLogEntries(logs[logTab] || [])
  const parsedEntries = entries.map(parseEventLine)
  const filteredEntries = logSearch.trim()
    ? parsedEntries.filter((entry) => entry.raw.toLowerCase().includes(logSearch.toLowerCase()))
    : parsedEntries
  const hasMojibake = parsedEntries.some((entry) => hasMojibakeText(entry.raw))
  const filteredServers = serverSearch.trim() ? servers.filter(s=>(s.name||'').toLowerCase().includes(serverSearch.toLowerCase())||(s.host||'').toLowerCase().includes(serverSearch.toLowerCase())) : servers

  const LOG_TABS = [
    {key:'system', label:'System Log', color:'#6c5ce7', desc:'syslog / messages'},
    {key:'auth', label:'Auth / Security', color:'#ef4444', desc:'auth.log / secure'},
    {key:'error', label:'Error / Kernel', color:'#facc15', desc:'kern.log / dmesg'},
  ]

  return (
    <ProtectedRoute requiredRole="admin">
      <div className="app-shell">
        <Sidebar />
        <div className="page" style={{maxWidth:'100%'}}>
          <h1>Логи серверов</h1>

          <div style={{display:'flex',gap:16,minHeight:'calc(100vh - 120px)'}}>
            {/* Server list */}
            <div className="card" style={{width:220,minWidth:220,padding:12,alignSelf:'flex-start',position:'sticky',top:16}}>
              <h4 style={{margin:'0 0 8px',fontSize:14}}>Серверы</h4>
              <input value={serverSearch} onChange={e=>setServerSearch(e.target.value)} placeholder="🔍 Поиск..." style={{width:'100%',padding:'5px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:11,marginBottom:6,outline:'none',boxSizing:'border-box'}}/>
              {loading && <div style={{color:'#9aa4b2',fontSize:12,padding:8}}>Загрузка...</div>}
              <div style={{display:'flex',flexDirection:'column',gap:2}}>
                {filteredServers.map(s => (
                  <div key={s.id} onClick={()=>selectServer(s)} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 10px',borderRadius:6,cursor:'pointer',background:selected?.id===s.id?'#6c5ce720':'transparent',border:selected?.id===s.id?'1px solid #6c5ce740':'1px solid transparent'}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:s.status==='ok'?'#4ade80':s.status==='down'?'#ef4444':'#9aa4b2'}}/>
                    <span style={{fontSize:13,color:'#fff'}}>{s.name}</span>
                  </div>
                ))}
                {!loading && servers.length===0 && <div style={{color:'#9aa4b2',fontSize:12}}>Нет серверов</div>}
              </div>
            </div>

            {/* Logs panel */}
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:12}}>
              {!selected ? (
                <div className="card" style={{padding:60,textAlign:'center'}}>
                  <div style={{fontSize:40,marginBottom:16,opacity:0.3}}>📜</div>
                  <div style={{color:'#9aa4b2',fontSize:15}}>Выберите сервер для просмотра логов</div>
                  <div style={{color:'#9aa4b2',fontSize:12,marginTop:8}}>Логи собираются агентом на Linux-серверах</div>
                </div>
              ) : (<>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <h2 style={{margin:0,fontSize:18}}>{selected.name} — Логи</h2>
                  <span style={{fontSize:12,color:'#9aa4b2'}}>{selected.host || selected.id}</span>
                </div>

                {/* Log type tabs */}
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  {LOG_TABS.map(t => (
                    <button key={t.key} onClick={()=>setLogTab(t.key)} style={{padding:'8px 16px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:logTab===t.key?t.color+'30':'#0d1b2e',color:logTab===t.key?t.color:'#9aa4b2'}}>
                      {t.label}
                      <span style={{fontSize:10,marginLeft:6,opacity:0.6}}>({(logs[t.key]||[]).length})</span>
                    </button>
                  ))}
                  <div style={{flex:1}}/>
                  <input value={logSearch} onChange={e=>setLogSearch(e.target.value)} placeholder="🔍 Поиск в логах..." style={{padding:'5px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:11,width:200,outline:'none'}}/>
                </div>

                <div className="card" style={{padding:16}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,gap:12,flexWrap:'wrap'}}>
                    <div style={{fontSize:12,color:'#9aa4b2'}}>{LOG_TABS.find(t=>t.key===logTab)?.desc}</div>
                    <span style={{fontSize:11,color:'#9aa4b2'}}>{entries.length} строк</span>
                    {hasMojibake && (
                      <span style={{fontSize:11,color:'#facc15',background:'#facc1515',border:'1px solid #facc1530',padding:'2px 8px',borderRadius:6}}>
                        Обнаружены проблемы кодировки в части логов
                      </span>
                    )}
                  </div>

                  {entries.length === 0 ? (
                    <div style={{padding:40,textAlign:'center',color:'#9aa4b2',fontSize:13}}>
                      Нет логов. Агент ещё не прислал данные или у него нет прав на чтение этого журнала.
                    </div>
                  ) : filteredEntries.length === 0 ? (
                    <div style={{padding:40,textAlign:'center',color:'#9aa4b2',fontSize:13}}>
                      Ничего не найдено по запросу "{logSearch}"
                    </div>
                  ) : (
                    <div style={{maxHeight:600,overflowY:'auto',background:'#050d1a',borderRadius:6,padding:12,display:'flex',flexDirection:'column',gap:8}}>
                      {filteredEntries.map((entry,i) => {
                        const rowKey = `${logTab}-${selected?.id || 'none'}-${i}`
                        const expanded = !!expandedRows[rowKey]
                        const levelSrc = `${entry.level || ''} ${entry.message || ''}`
                        const isError = /error|fail|crit|panic|emergency|fatal/i.test(levelSrc)
                        const isWarn = /warn|timeout|refused|denied|degraded/i.test(levelSrc)
                        const isSsh = /ssh|sshd|session opened|accepted/i.test(levelSrc)
                        const color = isError ? '#ef4444' : isWarn ? '#facc15' : isSsh ? '#00d4ff' : '#c8d1dc'
                        const fullText = entry.message || entry.raw
                        const previewText = fullText.length > 500 && !expanded ? `${fullText.slice(0, 500)}...` : fullText
                        return (
                          <div key={i} style={{border:'1px solid #1a294030',borderRadius:6,padding:'8px 10px',background:'#071120'}}>
                            <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:4}}>
                              <span style={{color:'#9aa4b2',fontSize:10,userSelect:'none'}}>{String(i+1).padStart(3)}</span>
                              {entry.parsed && <span style={{fontSize:10,color:'#9aa4b2'}}>#{entry.index}</span>}
                              {entry.logName && <span style={{fontSize:10,color:'#818cf8',background:'#818cf815',padding:'1px 6px',borderRadius:4}}>{entry.logName}</span>}
                              {entry.eventId && <span style={{fontSize:10,color:'#9aa4b2'}}>ID: {entry.eventId}</span>}
                              {entry.level && <span style={{fontSize:10,color:color,fontWeight:600}}>{entry.level}</span>}
                              {entry.date && <span style={{fontSize:10,color:'#9aa4b2'}}>{entry.date}</span>}
                            </div>
                            {entry.source && <div style={{fontSize:11,color:'#9aa4b2',marginBottom:4}}>Source: {entry.source}</div>}
                            <div
                              style={{
                                fontFamily:'"JetBrains Mono",Consolas,monospace',
                                fontSize:11,
                                lineHeight:1.6,
                                whiteSpace:'pre-wrap',
                                wordBreak:'break-all',
                                overflowWrap:'anywhere',
                                color,
                              }}
                            >
                              {previewText}
                            </div>
                            {fullText.length > 500 && (
                              <button
                                onClick={() => setExpandedRows((prev) => ({...prev, [rowKey]: !expanded}))}
                                style={{marginTop:6,padding:'2px 8px',borderRadius:4,border:'1px solid #1a2940',background:'#0d1b2e',color:'#9aa4b2',cursor:'pointer',fontSize:11}}
                              >
                                {expanded ? 'Свернуть' : 'Показать полностью'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {logSearch && <div style={{fontSize:10,color:'#9aa4b2',marginTop:6}}>Найдено: {filteredEntries.length} из {entries.length}</div>}
                </div>
              </>)}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
