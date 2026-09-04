import {useEffect, useState, useCallback} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

function StatusBadge({status}){
  const colors = {valid:'#4ade80', active:'#4ade80', expiring:'#facc15', expired:'#ef4444', invalid:'#ef4444'}
  const labels = {valid:'Valid', active:'Valid', expiring:'Expiring Soon', expired:'Expired', invalid:'Invalid'}
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      <span style={{width:8,height:8,borderRadius:'50%',background:colors[status]||'#9aa4b2'}}/>
      <span style={{fontSize:12,color:colors[status]||'#9aa4b2',fontWeight:600}}>{labels[status]||status}</span>
    </span>
  )
}

export default function SSLCertificates() {
  const [certs, setCerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const loadData = useCallback(async () => {
    try {
      const serversData = await apiFetch('/api/servers')
      const serversList = Array.isArray(serversData) ? serversData : (serversData?.servers || [])
      const details = await Promise.all(
        serversList.map(async (s) => {
          try {
            const res = await apiFetch(`/api/servers/${s.id}/detail`)
            return { serverName: s.name, detail: res?.detail || {} }
          } catch {
            return { serverName: s.name, detail: {} }
          }
        })
      )

      let allCerts = []
      for (const item of details) {
        const items = item.detail.ssl_certificates || []
        for (const cert of items) {
          allCerts.push({
            ...cert,
            serverName: item.serverName,
          })
        }
      }
      setCerts(allCerts)
    } catch(e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    const t = setInterval(loadData, 20000)
    return () => clearInterval(t)
  }, [loadData])

  const filtered = certs.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (c.domain || '').toLowerCase().includes(q) ||
      (c.issuer || '').toLowerCase().includes(q) ||
      (c.serverName || '').toLowerCase().includes(q)
    )
  })

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <div className="page">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <h1 style={{margin:0}}>SSL-сертификаты</h1>
            <span style={{fontSize:12,color:'#9aa4b2'}}>Всего отслеживается: {certs.length}</span>
          </div>

          <div style={{marginBottom:16}}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Поиск SSL-сертификатов по домену, издателю или серверу..."
              style={{width:'100%',padding:'10px 14px',borderRadius:6,border:'1px solid #1a2940',background:'#07111e',color:'#fff',fontSize:13,outline:'none'}}
            />
          </div>

          <div className="card" style={{padding:16}}>
            {loading && certs.length === 0 ? (
              <div style={{color:'#9aa4b2',padding:20,textAlign:'center'}}>Загрузка данных...</div>
            ) : filtered.length === 0 ? (
              <div style={{color:'#9aa4b2',padding:20,textAlign:'center'}}>Нет отслеживаемых SSL-сертификатов. Настройте переменную MONITOR_SSL_DOMAINS на агенте.</div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid #1a2940',textAlign:'left',color:'#9aa4b2'}}>
                      <th style={{padding:10}}>Домен</th>
                      <th style={{padding:10}}>Издатель</th>
                      <th style={{padding:10}}>Осталось дней</th>
                      <th style={{padding:10}}>Истекает</th>
                      <th style={{padding:10}}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c, i) => (
                      <tr key={i} style={{borderBottom:'1px solid #1a294020'}}>
                        <td style={{padding:10,fontWeight:600,color:'#fff'}}>{c.domain}</td>
                        <td style={{padding:10,color:'#9aa4b2'}}>{c.issuer}</td>
                        <td style={{padding:10,fontWeight:700,color:c.days_left < 15 ? '#ef4444' : '#4ade80'}}>{c.days_left} дн.</td>
                        <td style={{padding:10}}>{c.expires_at}</td>
                        <td style={{padding:10}}><StatusBadge status={c.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  )
}
