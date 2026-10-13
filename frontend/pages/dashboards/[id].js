import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Sidebar from '../../components/Sidebar'
import ProtectedRoute from '../../components/ProtectedRoute'
import apiFetch, { dashboardsApi } from '../../lib/api'
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts'
import {
  LayoutDashboard,
  Plus,
  Trash2,
  Edit3,
  ArrowLeft,
  Box,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Server,
  Clock,
  Layers,
  Settings,
  X,
  Check
} from 'lucide-react'

const WIDGET_TYPES = [
  { id: 'metric_chart', label: 'График метрики (Area)', desc: 'Временной ряд CPU, RAM, Disk или Ping' },
  { id: 'stats_card', label: 'Карточка показателя', desc: 'Текущее числовое значение и статус' },
  { id: 'server_status', label: 'Сводка серверов', desc: 'Количество онлайн/оффлайн узлов' },
  { id: 'uptime_bar', label: 'Индикатор доступности', desc: 'SLA доступность за 24ч, 7д и 30д' },
  { id: 'alert_list', label: 'Список активных алертов', desc: 'Последние критические события' },
]

function WidgetModal({ dashboardId, widget, onClose, onSaved }) {
  const isEdit = !!widget
  const [servers, setServers] = useState([])
  const [showAdvancedJson, setShowAdvancedJson] = useState(false)
  
  const [form, setForm] = useState({
    widget_type: widget?.widget_type || 'metric_chart',
    title: widget?.title || '',
    server_id: widget?.config?.server_id || '',
    metric: widget?.config?.metric || 'cpu',
    unit: widget?.config?.unit || '%',
    width: widget?.width ?? 3,
    height: widget?.height ?? 2,
    raw_config: JSON.stringify(widget?.config || {}, null, 2),
  })
  
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    apiFetch('/api/servers')
      .then(d => {
        const srvs = d.servers || []
        setServers(srvs)
        if (srvs.length > 0 && !form.server_id) {
          setForm(f => ({ ...f, server_id: srvs[0].id }))
        }
      })
      .catch(() => {})
  }, [])

  const submit = async () => {
    setLoading(true)
    setError(null)
    
    let config = {}
    if (showAdvancedJson) {
      try {
        config = form.raw_config.trim() ? JSON.parse(form.raw_config) : {}
      } catch {
        setError('Неверный формат JSON в конфигурации')
        setLoading(false)
        return
      }
    } else {
      if (['metric_chart', 'stats_card', 'uptime_bar'].includes(form.widget_type)) {
        config = {
          server_id: form.server_id,
          metric: form.metric,
          unit: form.unit,
        }
      }
    }

    const payload = {
      widget_type: form.widget_type,
      title: form.title.trim() || WIDGET_TYPES.find(w => w.id === form.widget_type)?.label || 'Виджет',
      config,
      position_x: 0,
      position_y: 0,
      width: Number(form.width) || 3,
      height: Number(form.height) || 2,
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

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #1e293b',
    background: '#090d16',
    color: '#f8fafc',
    fontSize: 12,
    marginBottom: 12,
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 480, maxHeight: '90vh', overflowY: 'auto', background: '#101726', border: '1px solid #1e293b', borderRadius: 8, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: '#fff', margin: 0, fontSize: 16, fontWeight: 700 }}>
            {isEdit ? 'Настройка виджета' : 'Добавить виджет на дашборд'}
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ color: '#f87171', fontSize: 12, marginBottom: 14, padding: '8px 12px', background: '#ef444415', border: '1px solid #ef444430', borderRadius: 6 }}>
            {error}
          </div>
        )}

        <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>ТИП ВИДЖЕТА</label>
        <select
          value={form.widget_type}
          onChange={e => setForm(f => ({ ...f, widget_type: e.target.value }))}
          style={inputStyle}
        >
          {WIDGET_TYPES.map(t => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>

        <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>ЗАГОЛОВОК</label>
        <input
          placeholder="Например: Загрузка CPU кластера"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          style={inputStyle}
        />

        {['metric_chart', 'stats_card', 'uptime_bar'].includes(form.widget_type) && !showAdvancedJson && (
          <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 6, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Settings size={13} />
              <span>Параметры источника телеметрии</span>
            </div>
            
            <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>СЕРВЕР</label>
            <select
              value={form.server_id}
              onChange={e => setForm(f => ({ ...f, server_id: e.target.value }))}
              style={{ ...inputStyle, marginBottom: 10 }}
            >
              {servers.map(s => (
                <option key={s.id} value={s.id}>{s.name || s.id} ({s.host || 'agent'})</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>МЕТРИКА</label>
                <select
                  value={form.metric}
                  onChange={e => {
                    const m = e.target.value
                    const u = m === 'ping' ? 'мс' : m === 'processes' ? '' : '%'
                    setForm(f => ({ ...f, metric: m, unit: u }))
                  }}
                  style={{ ...inputStyle, marginBottom: 0 }}
                >
                  <option value="cpu">CPU %</option>
                  <option value="ram">RAM %</option>
                  <option value="disk">Диск %</option>
                  <option value="swap">Swap %</option>
                  <option value="ping">Пинг (мс)</option>
                  <option value="processes">Процессы</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 10, color: '#64748b', display: 'block', marginBottom: 4 }}>ЕД. ИЗМЕРЕНИЯ</label>
                <input
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  style={{ ...inputStyle, marginBottom: 0 }}
                />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>Режим настройки:</span>
          <button
            type="button"
            onClick={() => setShowAdvancedJson(!showAdvancedJson)}
            style={{ background: 'none', border: 'none', color: '#38bdf8', fontSize: 11, cursor: 'pointer', padding: 0 }}
          >
            {showAdvancedJson ? '← Простой визуальный режим' : 'JSON конфигуратор →'}
          </button>
        </div>

        {showAdvancedJson && (
          <div>
            <label style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: 4 }}>CONFIG (RAW JSON)</label>
            <textarea
              value={form.raw_config}
              onChange={e => setForm(f => ({ ...f, raw_config: e.target.value }))}
              rows={4}
              style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #1e293b', cursor: 'pointer', background: 'transparent', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}
          >
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={loading}
            style={{
              padding: '8px 18px',
              borderRadius: 6,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              background: '#2563eb',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {loading ? 'Сохранение...' : 'Сохранить виджет'}
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
            time: t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            value: typeof val === 'number' ? val : 0
          }
        })
        setData(points)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [serverId, metric])

  if (loading) return <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11 }}>Загрузка телеметрии...</div>
  if (data.length === 0) return <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 11 }}>Нет данных</div>

  return (
    <div style={{ height: 110, width: '100%', marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${metric}-${serverId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <Tooltip contentStyle={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11 }} />
          <Area type="monotone" dataKey="value" stroke="#38bdf8" fill={`url(#grad-${metric}-${serverId})`} strokeWidth={2} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatsCardWidget({ serverId, metric, title, unit = '%' }) {
  const [val, setVal] = useState(null)

  useEffect(() => {
    if (!serverId) return
    apiFetch(`/api/servers/${serverId}/detail`)
      .then(res => {
        const d = res.detail || {}
        if (metric === 'cpu') setVal(d.cpu_detail?.total_percent ?? null)
        else if (metric === 'ram') setVal(d.ram_detail?.used_percent ?? null)
        else if (metric === 'disk') setVal(d.disks?.[0]?.percent ?? null)
        else setVal(null)
      })
      .catch(() => {})
  }, [serverId, metric])

  const numVal = typeof val === 'number' ? val : 0
  const color = numVal > 80 ? '#ef4444' : numVal > 60 ? '#f59e0b' : '#10b981'

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 28, fontWeight: 700, color, fontFeatureSettings: '"tnum"' }}>
        {val != null ? `${numVal.toFixed(1)} ${unit}` : '—'}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
        Хост: <span style={{ color: '#94a3b8' }}>{serverId}</span>
      </div>
    </div>
  )
}

function ServerStatusWidget() {
  const [servers, setServers] = useState([])

  useEffect(() => {
    apiFetch('/api/servers')
      .then(res => setServers(res.servers || []))
      .catch(() => {})
  }, [])

  const online = servers.filter(s => s.status === 'ok').length
  const total = servers.length

  return (
    <div style={{ display: 'flex', gap: 14, marginTop: 12 }}>
      <div style={{ flex: 1, background: '#090d16', border: '1px solid #1e293b', borderRadius: 6, padding: '10px 12px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{online}</div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>ОНЛАЙН</div>
      </div>
      <div style={{ flex: 1, background: '#090d16', border: '1px solid #1e293b', borderRadius: 6, padding: '10px 12px' }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: total - online > 0 ? '#ef4444' : '#64748b' }}>{total - online}</div>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>ОФФЛАЙН</div>
      </div>
    </div>
  )
}

function UptimeBarWidget({ serverId }) {
  const [sla, setSla] = useState(null)

  useEffect(() => {
    if (!serverId) return
    apiFetch('/api/sla/summary')
      .then(res => {
        const item = (res.summary || []).find(s => s.target_id === serverId)
        setSla(item || null)
      })
      .catch(() => {})
  }, [serverId])

  const u24 = sla?.uptime_24h != null ? sla.uptime_24h.toFixed(1) + '%' : '100%'
  const u30 = sla?.uptime_30d != null ? sla.uptime_30d.toFixed(1) + '%' : '100%'

  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
      <div style={{ flex: 1, background: '#090d16', border: '1px solid #1e293b', borderRadius: 6, padding: '8px 10px' }}>
        <div style={{ fontSize: 10, color: '#64748b' }}>24 ЧАСА</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981', marginTop: 2 }}>{u24}</div>
      </div>
      <div style={{ flex: 1, background: '#090d16', border: '1px solid #1e293b', borderRadius: 6, padding: '8px 10px' }}>
        <div style={{ fontSize: 10, color: '#64748b' }}>30 ДНЕЙ</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#10b981', marginTop: 2 }}>{u30}</div>
      </div>
    </div>
  )
}

function AlertListWidget() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/alerts?limit=5')
      .then(res => {
        const list = res.alerts || []
        setAlerts(list.filter(a => a.status === 'firing').slice(0, 3))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: '#64748b', fontSize: 11, padding: 10 }}>Загрузка...</div>
  if (alerts.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: 11, marginTop: 12 }}>
      <CheckCircle2 size={13} />
      <span>Активных тревог нет</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
      {alerts.map((a, i) => (
        <div key={i} style={{ fontSize: 11, background: '#ef444410', borderLeft: '3px solid #ef4444', padding: '6px 8px', borderRadius: 4 }}>
          <div style={{ fontWeight: 600, color: '#fff' }}>{a.title || a.message}</div>
          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{a.server_id}</div>
        </div>
      ))}
    </div>
  )
}

function WidgetCard({ widget, onEdit, onDelete }) {
  const cfg = widget.config || {}
  
  const renderContent = () => {
    if (widget.widget_type === 'metric_chart') {
      return <MetricChartWidget serverId={cfg.server_id} metric={cfg.metric} title={widget.title} />
    }
    if (widget.widget_type === 'stats_card') {
      return <StatsCardWidget serverId={cfg.server_id} metric={cfg.metric} title={widget.title} unit={cfg.unit} />
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
      <pre style={{ fontSize: 10, color: '#94a3b8', background: '#090d16', padding: 8, borderRadius: 4, overflow: 'auto', maxHeight: 120 }}>
        {JSON.stringify(widget.config, null, 2)}
      </pre>
    )
  }

  return (
    <div style={{
      background: '#101726',
      border: '1px solid #1e293b',
      borderRadius: 8,
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      minHeight: 180,
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>
              {WIDGET_TYPES.find(t => t.id === widget.widget_type)?.label || widget.widget_type}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>
              {widget.title || '(без названия)'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => onEdit(widget)}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #1e293b', cursor: 'pointer', background: '#090d16', color: '#94a3b8' }}
              title="Настроить"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={() => onDelete(widget)}
              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
              title="Удалить"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
        {renderContent()}
      </div>
    </div>
  )
}

export default function DashboardDetail() {
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const { id } = router.query

  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modalWidget, setModalWidget] = useState(undefined)

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
    setMounted(true)
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

  if (!mounted) return null

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto' }}>
          <button
            onClick={() => router.push('/dashboards')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: 'none',
              color: '#38bdf8',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 16,
              padding: 0,
            }}
          >
            <ArrowLeft size={14} />
            <span>Все дашборды</span>
          </button>

          {loading && <div style={{ color: '#64748b', padding: 20 }}>Загрузка...</div>}
          {error && <div style={{ color: '#ef4444', marginBottom: 12, padding: 10, background: '#ef444415', borderRadius: 6 }}>Ошибка: {error}</div>}

          {dashboard && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' }}>
                      {dashboard.name}
                    </h1>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      background: dashboard.is_public ? '#2563eb18' : '#1e293b',
                      color: dashboard.is_public ? '#38bdf8' : '#94a3b8',
                      border: `1px solid ${dashboard.is_public ? '#2563eb35' : '#334155'}`,
                    }}>
                      {dashboard.is_public ? 'Публичный' : 'Приватный'}
                    </span>
                  </div>
                  {dashboard.description && <p style={{ color: '#94a3b8', fontSize: 12, margin: '4px 0 0' }}>{dashboard.description}</p>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setModalWidget(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <Plus size={14} />
                    <span>Добавить виджет</span>
                  </button>
                  <button
                    onClick={deleteDashboard}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 14px',
                      borderRadius: 6,
                      border: '1px solid rgba(239,68,68,0.3)',
                      cursor: 'pointer',
                      background: 'rgba(239,68,68,0.1)',
                      color: '#ef4444',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Удалить дашборд</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                {(dashboard.widgets || []).map(w => (
                  <WidgetCard key={w.id} widget={w} onEdit={setModalWidget} onDelete={deleteWidget} />
                ))}
              </div>

              {(dashboard.widgets || []).length === 0 && (
                <div style={{ textAlign: 'center', padding: 70, background: '#101726', border: '1px solid #1e293b', borderRadius: 8 }}>
                  <div style={{ padding: 12, borderRadius: 10, background: '#2563eb15', color: '#38bdf8', display: 'inline-block', marginBottom: 12 }}>
                    <Box size={32} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 6 }}>Нет виджетов на дашборде</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>Добавьте первый график или индикатор состояния сервисов</div>
                  <button
                    onClick={() => setModalWidget(null)}
                    style={{
                      padding: '8px 18px',
                      borderRadius: 6,
                      border: 'none',
                      cursor: 'pointer',
                      background: '#2563eb',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    + Добавить виджет
                  </button>
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
