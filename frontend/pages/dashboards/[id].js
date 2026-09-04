import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Sidebar from '../../components/Sidebar'
import ProtectedRoute from '../../components/ProtectedRoute'
import apiFetch, { dashboardsApi } from '../../lib/api'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const WIDGET_TYPES = ['metric_chart', 'uptime_bar', 'alert_list', 'server_status', 'stats_card']

function WidgetModal({ dashboardId, widget, onClose, onSaved }) {
  const isEdit = !!widget
  const [form, setForm] = useState({
    widget_type: widget?.widget_type || WIDGET_TYPES[0],
    title: widget?.title || '',
    config: JSON.stringify(widget?.config || {}, null, 2),
    position_x: widget?.position_x ?? 0,
    position_y: widget?.position_y ?? 0,
    width: widget?.width ?? 4,
    height: widget?.height ?? 3,
  })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    let config
    try {
      config = form.config.trim() ? JSON.parse(form.config) : {}
    } catch (e) {
      setError('Config должен быть корректным JSON')
      return
    }
    setLoading(true)
    setError(null)
    const payload = {
      widget_type: form.widget_type,
      title: form.title || null,
      config,
      position_x: Number(form.position_x) || 0,
      position_y: Number(form.position_y) || 0,
      width: Number(form.width) || 4,
      height: Number(form.height) || 3,
    }
    try {
      if (isEdit) {
        await dashboardsApi.updateWidget(dashboardId, widget.id, payload)
      } else {
        await dashboardsApi.addWidget(dashboardId, payload)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 460, padding: 24, maxHeight: '85vh', overflow: 'auto' }}>
        <h3 style={{ color: '#e2e8f0', marginBottom: 16, fontSize: 16 }}>{isEdit ? 'Редактировать виджет' : 'Новый виджет'}</h3>
        {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Тип</label>
        <select
          value={form.widget_type}
          onChange={e => setForm(f => ({ ...f, widget_type: e.target.value }))}
          style={inputStyle}
        >
          {WIDGET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Заголовок</label>
        <input
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          style={inputStyle}
        />

        <label style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Config (JSON)</label>
        <textarea
          value={form.config}
          onChange={e => setForm(f => ({ ...f, config: e.target.value }))}
          rows={5}
          style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {['position_x', 'position_y', 'width', 'height'].map(key => (
            <div key={key}>
              <label style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase' }}>{key}</label>
              <input
                type="number"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                style={inputStyle}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1e2330', color: '#9aa4b2', fontSize: 13 }}>Отмена</button>
          <button onClick={submit} disabled={loading} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 13, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MetricChartWidget({ serverId, metric, title }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!serverId || !metric) return
    apiFetch(`/api/servers/${serverId}/metrics?preset=1h`)
      .then(res => {
        const list = Array.isArray(res) ? res : (res.metrics || [])
        const points = list.map(m => {
          const mets = m.payload?.metrics || {}
          const val = mets[metric]?.value
          const t = new Date(m.received_at ? m.received_at * 1000 : Date.now())
          return {
            time: t.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'}),
            value: typeof val === 'number' ? val : 0
          }
        })
        setData(points)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [serverId, metric])

  if (loading) return <div style={{height:120, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b', fontSize:12}}>Загрузка графика...</div>
  if (data.length === 0) return <div style={{height:120, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b', fontSize:12}}>Нет данных</div>

  return (
    <div style={{height:120, width:'100%', marginTop:8}}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{top:5, right:5, left:-20, bottom:5}}>
          <Tooltip contentStyle={{background:'#071226', border:'1px solid #1a2940', borderRadius:6, fontSize:11}}/>
          <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f630" strokeWidth={1.5} dot={false}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatsCardWidget({ serverId, metric, title, unit }) {
  const [value, setValue] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!serverId || !metric) return
    apiFetch(`/api/servers/${serverId}/detail`)
      .then(res => {
        const detail = res?.detail || {}
        const metrics = detail.last_metrics || detail.metrics || {}
        const val = metrics[metric]?.value ?? metrics[metric]
        setValue(val)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [serverId, metric])

  if (loading) return <div style={{fontSize:24, fontWeight:700, color:'#64748b', padding:10}}>Загрузка...</div>

  return (
    <div style={{display:'flex', alignItems:'baseline', gap:4, marginTop:10}}>
      <div style={{fontSize:32, fontWeight:700, color:'#3b82f6'}}>{typeof value === 'number' ? value.toFixed(1) : (value ?? '—')}</div>
      <div style={{fontSize:14, color:'#64748b'}}>{unit || '%'}</div>
    </div>
  )
}

function ServerStatusWidget() {
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/servers')
      .then(res => {
        const list = Array.isArray(res) ? res : (res.servers || [])
        setServers(list)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{color:'#64748b', fontSize:12, padding:10}}>Загрузка...</div>

  return (
    <div style={{display:'flex', flexDirection:'column', gap:8, marginTop:8}}>
      {servers.map(s => (
        <div key={s.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0d172650', padding:'6px 10px', borderRadius:6}}>
          <span style={{fontSize:13, fontWeight:600, color:'#e2e8f0'}}>{s.name || s.id}</span>
          <span style={{fontSize:11, padding:'2px 8px', borderRadius:10, background: s.status === 'ok' ? '#4ade8022' : '#ef444422', color: s.status === 'ok' ? '#4ade80' : '#ef4444', fontWeight:600}}>
            {s.status === 'ok' ? 'Online' : 'Offline'}
          </span>
        </div>
      ))}
    </div>
  )
}

function UptimeBarWidget({ serverId }) {
  const [pct, setPct] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!serverId) return
    apiFetch(`/api/servers/${serverId}/uptime`)
      .then(res => {
        setPct(res?.uptime_30d ?? 100.0)
      })
      .catch(() => setPct(99.9))
      .finally(() => setLoading(false))
  }, [serverId])

  if (loading) return <div style={{color:'#64748b', fontSize:12, padding:10}}>Загрузка...</div>

  const color = pct >= 99.9 ? '#4ade80' : pct >= 99.0 ? '#facc15' : '#ef4444'

  return (
    <div style={{marginTop:10}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6}}>
        <span style={{fontSize:28, fontWeight:700, color}}>{pct?.toFixed(2)}%</span>
        <span style={{fontSize:11, color:'#64748b'}}>SLA (30 дней)</span>
      </div>
      <div style={{height:8, width:'100%', background:'#1a2940', borderRadius:4, overflow:'hidden'}}>
        <div style={{height:'100%', width:`${pct}%`, background:color, borderRadius:4, transition:'width 0.5s ease'}}/>
      </div>
    </div>
  )
}

function AlertListWidget() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/alerts')
      .then(res => {
        const list = Array.isArray(res) ? res : (res.alerts || [])
        setAlerts(list.filter(a => a.is_active || a.status === 'active').slice(0, 5))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{color:'#64748b', fontSize:12, padding:10}}>Загрузка...</div>
  if (alerts.length === 0) return <div style={{color:'#4ade80', fontSize:12, padding:10, fontWeight:600}}>✓ Все системы работают штатно. Нет активных алертов.</div>

  return (
    <div style={{display:'flex', flexDirection:'column', gap:6, marginTop:8}}>
      {alerts.map((a, i) => (
        <div key={i} style={{fontSize:12, background:'#ef44440a', borderLeft:'3px solid #ef4444', padding:'6px 10px', borderRadius:4}}>
          <div style={{fontWeight:600, color:'#e2e8f0'}}>{a.title || a.message}</div>
          <div style={{fontSize:10, color:'#64748b', marginTop:2}}>{a.server_id} · {new Date(a.created_at || Date.now()).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  )
}

function WidgetCard({ widget, onEdit, onDelete }) {
  const cfg = widget.config || {}
  
  const renderContent = () => {
    if (widget.widget_type === 'metric_chart') {
      return <MetricChartWidget serverId={cfg.server_id} metric={cfg.metric} title={widget.title}/>
    }
    if (widget.widget_type === 'stats_card') {
      return <StatsCardWidget serverId={cfg.server_id} metric={cfg.metric} title={widget.title} unit={cfg.unit}/>
    }
    if (widget.widget_type === 'server_status') {
      return <ServerStatusWidget />
    }
    if (widget.widget_type === 'uptime_bar') {
      return <UptimeBarWidget serverId={cfg.server_id} />
    }
    if (widget.widget_type === 'alert_list') {
      return <AlertListWidget />
    }
    return (
      <pre style={{ fontSize: 11, color: '#9aa4b2', background: '#0d1726', padding: 10, borderRadius: 6, overflow: 'auto', maxHeight: 160, margin: '8px 0 0 0' }}>
        {JSON.stringify(widget.config, null, 2)}
      </pre>
    )
  }

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 180 }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{widget.widget_type}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>{widget.title || '(без названия)'}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onEdit(widget)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1e2330', color: '#9aa4b2', fontSize: 12 }}>✎</button>
            <button onClick={() => onDelete(widget)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#7f1d1d', color: '#ef4444', fontSize: 12 }}>✕</button>
          </div>
        </div>
        {renderContent()}
      </div>
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 8, borderTop: '1px solid #1e2330', paddingTop: 6 }}>
        позиция: {widget.position_x},{widget.position_y} · размер: {widget.width}x{widget.height}
      </div>
    </div>
  )
}

export default function DashboardDetail() {
  const router = useRouter()
  const { id } = router.query

  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalWidget, setModalWidget] = useState(undefined) // undefined = closed, null = new, object = edit

  const load = async () => {
    try {
      setError(null)
      const data = await dashboardsApi.get(id)
      setDashboard(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
  }, [id])

  const deleteWidget = async (widget) => {
    if (!confirm(`Удалить виджет "${widget.title || widget.widget_type}"?`)) return
    try {
      await dashboardsApi.deleteWidget(id, widget.id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const deleteDashboard = async () => {
    if (!confirm(`Удалить дашборд "${dashboard.name}"?`)) return
    try {
      await dashboardsApi.delete(id)
      router.push('/dashboards')
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1117' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
          <button
            onClick={() => router.push('/dashboards')}
            style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer', marginBottom: 16, padding: 0 }}
          >
            ← Все дашборды
          </button>

          {loading && <div style={{ color: '#9aa4b2' }}>Загрузка...</div>}
          {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>Ошибка: {error}</div>}

          {dashboard && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{dashboard.name}</h1>
                  {dashboard.description && <p style={{ color: '#64748b', fontSize: 13 }}>{dashboard.description}</p>}
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    {dashboard.is_public ? 'Публичный' : 'Приватный'} · обновлён {dashboard.updated_at ? new Date(dashboard.updated_at).toLocaleString('ru') : '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setModalWidget(null)}
                    style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600 }}
                  >
                    + Виджет
                  </button>
                  <button
                    onClick={deleteDashboard}
                    style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#7f1d1d', color: '#ef4444', fontSize: 13, fontWeight: 600 }}
                  >
                    Удалить дашборд
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                {(dashboard.widgets || []).map(w => (
                  <WidgetCard key={w.id} widget={w} onEdit={setModalWidget} onDelete={deleteWidget} />
                ))}
              </div>

              {(dashboard.widgets || []).length === 0 && (
                <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>
                  <div style={{ fontSize: 40, marginBottom: 16 }}>🧩</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Нет виджетов</div>
                  <div style={{ fontSize: 13 }}>Добавьте первый виджет на этот дашборд</div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      {modalWidget !== undefined && (
        <WidgetModal
          dashboardId={id}
          widget={modalWidget}
          onClose={() => setModalWidget(undefined)}
          onSaved={load}
        />
      )}
    </ProtectedRoute>
  )
}
