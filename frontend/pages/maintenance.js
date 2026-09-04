import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function WindowCard({ w, onCancel }) {
  const now = new Date()
  const start = new Date(w.start_at)
  const end = new Date(w.end_at)
  const isActive = w.is_active && start <= now && end >= now
  const isPast = end < now
  const isFuture = start > now

  return (
    <div className="card" style={{ padding: '14px 18px', marginBottom: 10, borderLeft: `3px solid ${isActive ? '#4ade80' : isPast ? '#374151' : '#facc15'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>{w.name}</span>
          {isActive && <span style={{ padding: '2px 8px', borderRadius: 4, background: '#166534', color: '#4ade80', fontSize: 11, fontWeight: 600 }}>Активно</span>}
          {isFuture && w.is_active && <span style={{ padding: '2px 8px', borderRadius: 4, background: '#854d0e', color: '#facc15', fontSize: 11, fontWeight: 600 }}>Запланировано</span>}
          {(!w.is_active || isPast) && <span style={{ padding: '2px 8px', borderRadius: 4, background: '#1e2330', color: '#64748b', fontSize: 11, fontWeight: 600 }}>Завершено</span>}
        </div>
        {w.is_active && !isPast && (
          <button
            onClick={() => onCancel(w.id)}
            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#7f1d1d', color: '#ef4444', fontSize: 11 }}
          >
            Отменить
          </button>
        )}
      </div>
      {w.description && <div style={{ fontSize: 12, color: '#9aa4b2', marginBottom: 6 }}>{w.description}</div>}
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#64748b', flexWrap: 'wrap' }}>
        <span>📅 {formatDate(w.start_at)} — {formatDate(w.end_at)}</span>
        {w.target_type && <span>🎯 {w.target_type}{w.target_ids?.length ? ` (${w.target_ids.length} объектов)` : ''}</span>}
        {w.suppress_alerts && <span>🔕 Алерты подавляются</span>}
      </div>
    </div>
  )
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', description: '', start_at: '', end_at: '',
    target_type: 'all', target_ids: '', suppress_alerts: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!form.name.trim()) return setError('Название обязательно')
    if (!form.start_at || !form.end_at) return setError('Укажите начало и конец')
    if (new Date(form.end_at) <= new Date(form.start_at)) return setError('Конец должен быть позже начала')
    setLoading(true)
    setError(null)
    try {
      const body = {
        name: form.name,
        description: form.description || null,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        target_type: form.target_type || null,
        target_ids: form.target_ids ? form.target_ids.split(',').map(s => s.trim()).filter(Boolean) : [],
        suppress_alerts: form.suppress_alerts,
      }
      await apiFetch('/api/maintenance', { method: 'POST', body: JSON.stringify(body) })
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const now = new Date()
  const defaultStart = toLocalInput(now.toISOString())
  const defaultEnd = toLocalInput(new Date(now.getTime() + 3600000).toISOString())

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 480, padding: 24 }}>
        <h3 style={{ color: '#e2e8f0', marginBottom: 16, fontSize: 16 }}>Новое окно обслуживания</h3>
        {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}
        <input
          placeholder="Название *"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13, marginBottom: 10, boxSizing: 'border-box' }}
        />
        <textarea
          placeholder="Описание"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13, marginBottom: 10, resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Начало *</div>
            <input
              type="datetime-local"
              defaultValue={defaultStart}
              onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Конец *</div>
            <input
              type="datetime-local"
              defaultValue={defaultEnd}
              onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Тип цели</div>
            <select
              value={form.target_type}
              onChange={e => setForm(f => ({ ...f, target_type: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13 }}
            >
              <option value="all">Все</option>
              <option value="server">Серверы</option>
              <option value="website">Сайты</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>IDs (через запятую)</div>
            <input
              placeholder="srv-1, srv-2"
              value={form.target_ids}
              onChange={e => setForm(f => ({ ...f, target_ids: e.target.value }))}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e2330', background: '#0f1117', color: '#e2e8f0', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13, color: '#9aa4b2' }}>
          <input
            type="checkbox"
            checked={form.suppress_alerts}
            onChange={e => setForm(f => ({ ...f, suppress_alerts: e.target.checked }))}
          />
          Подавлять алерты во время окна
        </label>
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

export default function Maintenance() {
  const [windows, setWindows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [includePast, setIncludePast] = useState(false)

  const load = async () => {
    try {
      setError(null)
      const res = await apiFetch(`/api/maintenance?include_past=${includePast}`)
      setWindows(res.windows || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const cancelWindow = async (id) => {
    if (!confirm('Отменить окно обслуживания?')) return
    try {
      await apiFetch(`/api/maintenance/${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  useEffect(() => { load() }, [includePast])

  const activeWindows = windows.filter(w => {
    const now = new Date()
    return w.is_active && new Date(w.start_at) <= now && new Date(w.end_at) >= now
  })

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1117' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Окна обслуживания</h1>
              <p style={{ color: '#64748b', fontSize: 13 }}>
                {activeWindows.length > 0
                  ? <span style={{ color: '#4ade80' }}>🟢 {activeWindows.length} активных окна — алерты подавляются</span>
                  : 'Плановые работы и подавление алертов'}
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600 }}
            >
              + Новое окно
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#9aa4b2', cursor: 'pointer' }}>
              <input type="checkbox" checked={includePast} onChange={e => setIncludePast(e.target.checked)} />
              Показать прошедшие
            </label>
            <button onClick={load} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1e2330', color: '#9aa4b2', fontSize: 13 }}>
              Обновить
            </button>
          </div>

          {loading && <div style={{ color: '#9aa4b2' }}>Загрузка...</div>}
          {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>Ошибка: {error}</div>}

          {windows.map(w => (
            <WindowCard key={w.id} w={w} onCancel={cancelWindow} />
          ))}
          {!loading && windows.length === 0 && (
            <div style={{ color: '#64748b', textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔧</div>
              Нет запланированных окон обслуживания
            </div>
          )}
        </main>
      </div>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </ProtectedRoute>
  )
}
