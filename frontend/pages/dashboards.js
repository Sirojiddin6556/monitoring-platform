import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import { dashboardsApi } from '../lib/api'

function DashboardCard({ dash, onOpen, onDelete }) {
  return (
    <div
      className="card"
      style={{ padding: 20, cursor: 'pointer', transition: 'border-color 0.15s', minWidth: 200 }}
      onClick={() => onOpen(dash.id)}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>{dash.name}</div>
      {dash.description && <div style={{ fontSize: 12, color: '#9aa4b2', marginBottom: 10 }}>{dash.description}</div>}
      <div style={{ fontSize: 11, color: '#64748b' }}>
        {dash.widget_count ?? 0} виджетов · {dash.updated_at ? new Date(dash.updated_at).toLocaleDateString('ru') : ''}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={e => { e.stopPropagation(); onOpen(dash.id) }}
          style={{ flex: 1, padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 12 }}
        >
          Открыть
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(dash.id, dash.name) }}
          style={{ padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#7f1d1d', color: '#ef4444', fontSize: 12 }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', description: '', is_public: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async () => {
    if (!form.name.trim()) return setError('Название обязательно')
    setLoading(true)
    setError(null)
    try {
      await dashboardsApi.create(form)
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
      <div className="card" style={{ width: 420, padding: 24 }}>
        <h3 style={{ color: '#e2e8f0', marginBottom: 16, fontSize: 16 }}>Новый дашборд</h3>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, cursor: 'pointer', fontSize: 13, color: '#9aa4b2' }}>
          <input type="checkbox" checked={form.is_public} onChange={e => setForm(f => ({ ...f, is_public: e.target.checked }))} />
          Публичный (доступен всем пользователям)
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

export default function Dashboards() {
  const [dashboards, setDashboards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const router = useRouter()

  const load = async () => {
    try {
      setError(null)
      const res = await dashboardsApi.list()
      setDashboards(res.dashboards || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteDash = async (id, name) => {
    if (!confirm(`Удалить дашборд "${name}"?`)) return
    try {
      await dashboardsApi.delete(id)
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1117' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>Дашборды</h1>
              <p style={{ color: '#64748b', fontSize: 13 }}>Кастомные панели мониторинга</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 600 }}
            >
              + Новый дашборд
            </button>
          </div>

          {loading && <div style={{ color: '#9aa4b2' }}>Загрузка...</div>}
          {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>Ошибка: {error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {dashboards.map(d => (
              <DashboardCard
                key={d.id}
                dash={d}
                onOpen={id => router.push(`/dashboards/${id}`)}
                onDelete={deleteDash}
              />
            ))}
          </div>

          {!loading && dashboards.length === 0 && (
            <div style={{ textAlign: 'center', padding: 80, color: '#64748b' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>Нет дашбордов</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>Создайте первый дашборд для мониторинга инфраструктуры</div>
              <button
                onClick={() => setShowCreate(true)}
                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 600 }}
              >
                Создать дашборд
              </button>
            </div>
          )}
        </main>
      </div>
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </ProtectedRoute>
  )
}
