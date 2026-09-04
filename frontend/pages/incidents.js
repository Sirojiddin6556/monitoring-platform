import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

const SEVERITY_COLORS = { critical: '#ef4444', warning: '#facc15', info: '#3b82f6' }
const STATUS_COLORS = {
  open: { bg: '#7f1d1d', text: '#ef4444' },
  acknowledged: { bg: '#1e3a5f', text: '#60a5fa' },
  resolved: { bg: '#166534', text: '#4ade80' },
  closed: { bg: '#1e2330', text: '#64748b' },
}

function SeverityBadge({ severity }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      background: SEVERITY_COLORS[severity] ? `${SEVERITY_COLORS[severity]}22` : '#1e2330',
      color: SEVERITY_COLORS[severity] || '#9aa4b2', fontSize: 11, fontWeight: 600,
    }}>{severity}</span>
  )
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.open
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      background: c.bg, color: c.text, fontSize: 11, fontWeight: 600,
    }}>
      {{ open: 'Открыт', acknowledged: 'Принят', resolved: 'Решён', closed: 'Закрыт' }[status] || status}
    </span>
  )
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', severity: 'warning' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!form.title.trim()) return setError('Заголовок обязателен')
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/incidents', { method: 'POST', body: JSON.stringify(form) })
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 460, padding: 24 }}>
        <h3 style={{ color: '#e2e8f0', marginBottom: 16, fontSize: 16 }}>Новый инцидент</h3>
        {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <input
          placeholder="Заголовок *"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
        />
        <textarea
          placeholder="Описание"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={3}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13, marginBottom: 10, resize: 'vertical', boxSizing: 'border-box' }}
        />
        <select
          value={form.severity}
          onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13, marginBottom: 16 }}
        >
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="critical">critical</option>
        </select>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1e2330', color: '#9aa4b2', fontSize: 13 }}>Отмена</button>
          <button onClick={submit} disabled={loading} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 13, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Incidents() {
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('open')
  const [selected, setSelected] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const load = async () => {
    try {
      setError(null)
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
      const res = await apiFetch(`/api/incidents${params}`)
      setIncidents(res.incidents || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const doAction = async (id, action) => {
    setActionLoading(true)
    try {
      await apiFetch(`/api/incidents/${id}/${action}`, { method: 'POST' })
      await load()
      setSelected(prev => prev?.id === id ? null : prev)
    } catch (err) {
      alert(err.message)
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  const counts = incidents.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1
    return acc
  }, {})

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1117' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Инциденты</h1>
              <p style={{ color: '#64748b', fontSize: 13 }}>Управление инцидентами и эскалациями</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600 }}
            >
              + Новый инцидент
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {['all', 'open', 'acknowledged', 'resolved', 'closed'].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: statusFilter === s ? '#3b82f6' : '#1e2330',
                  color: statusFilter === s ? '#fff' : '#9aa4b2', fontSize: 13,
                }}
              >
                {{ all: 'Все', open: 'Открытые', acknowledged: 'Принятые', resolved: 'Решённые', closed: 'Закрытые' }[s]}
                {s !== 'all' && counts[s] ? ` (${counts[s]})` : ''}
              </button>
            ))}
          </div>

          {loading && <div style={{ color: '#9aa4b2' }}>Загрузка...</div>}
          {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>Ошибка: {error}</div>}

          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}>
              {incidents.map(inc => (
                <div
                  key={inc.id}
                  className="card"
                  onClick={() => setSelected(selected?.id === inc.id ? null : inc)}
                  style={{ padding: '14px 18px', marginBottom: 8, cursor: 'pointer', borderLeft: `3px solid ${SEVERITY_COLORS[inc.severity] || '#3b82f6'}` }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>#{inc.id} {inc.title}</span>
                    <SeverityBadge severity={inc.severity} />
                    <StatusBadge status={inc.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#64748b' }}>
                    {inc.description && <span>{inc.description.slice(0, 80)}{inc.description.length > 80 ? '...' : ''}</span>}
                    <span style={{ marginLeft: 'auto' }}>{inc.opened_at ? new Date(inc.opened_at).toLocaleString('ru') : ''}</span>
                  </div>
                </div>
              ))}
              {!loading && incidents.length === 0 && (
                <div style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>Нет инцидентов</div>
              )}
            </div>

            {selected && (
              <div className="card" style={{ width: 300, padding: 20, flexShrink: 0, alignSelf: 'flex-start' }}>
                <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>#{selected.id} {selected.title}</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  <SeverityBadge severity={selected.severity} />
                  <StatusBadge status={selected.status} />
                </div>
                {selected.description && <div style={{ fontSize: 13, color: '#9aa4b2', marginBottom: 12 }}>{selected.description}</div>}
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                  <div>Открыт: {selected.opened_at ? new Date(selected.opened_at).toLocaleString('ru') : '—'}</div>
                  {selected.acknowledged_at && <div>Принят: {new Date(selected.acknowledged_at).toLocaleString('ru')}</div>}
                  {selected.resolved_at && <div>Решён: {new Date(selected.resolved_at).toLocaleString('ru')}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selected.status === 'open' && (
                    <button
                      onClick={() => doAction(selected.id, 'acknowledge')}
                      disabled={actionLoading}
                      style={{ padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1e3a5f', color: '#60a5fa', fontSize: 12 }}
                    >
                      Принять в работу
                    </button>
                  )}
                  {['open', 'acknowledged'].includes(selected.status) && (
                    <button
                      onClick={() => doAction(selected.id, 'resolve')}
                      disabled={actionLoading}
                      style={{ padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#166534', color: '#4ade80', fontSize: 12 }}
                    >
                      Пометить решённым
                    </button>
                  )}
                  {selected.status === 'resolved' && (
                    <button
                      onClick={() => doAction(selected.id, 'close')}
                      disabled={actionLoading}
                      style={{ padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1e2330', color: '#9aa4b2', fontSize: 12 }}
                    >
                      Закрыть
                    </button>
                  )}
                  <button
                    onClick={() => setSelected(null)}
                    style={{ padding: '7px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#0f1117', color: '#64748b', fontSize: 12 }}
                  >
                    Закрыть панель
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </ProtectedRoute>
  )
}
