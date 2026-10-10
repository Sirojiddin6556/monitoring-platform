import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import { dashboardsApi } from '../lib/api'
import { LayoutDashboard, Plus, Trash2, ArrowRight, Clock, Box } from 'lucide-react'

function DashboardCard({ dash, onOpen, onDelete }) {
  return (
    <div
      style={{
        background: '#101726',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '20px 22px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        transition: 'all 0.15s ease',
      }}
      onClick={() => onOpen(dash.id)}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{dash.name}</div>
          <span
            style={{
              padding: '2px 7px',
              borderRadius: 4,
              fontSize: 10,
              fontWeight: 600,
              background: dash.is_public ? '#2563eb18' : '#1e293b',
              color: dash.is_public ? '#38bdf8' : '#94a3b8',
              border: `1px solid ${dash.is_public ? '#2563eb35' : '#334155'}`,
            }}
          >
            {dash.is_public ? 'Публичный' : 'Приватный'}
          </span>
        </div>

        {dash.description && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12, lineHeight: 1.4 }}>
            {dash.description}
          </div>
        )}

        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Box size={13} /> {dash.widget_count ?? 0} виджетов
          <span>·</span>
          <Clock size={13} /> {dash.updated_at ? new Date(dash.updated_at).toLocaleDateString('ru-RU') : '—'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18, borderTop: '1px solid #1e293b', paddingTop: 14 }}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpen(dash.id)
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '7px 12px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            background: '#2563eb',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Открыть <ArrowRight size={13} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(dash.id, dash.name)
          }}
          style={{
            padding: '7px 12px',
            borderRadius: 6,
            border: '1px solid #ef444435',
            cursor: 'pointer',
            background: '#ef444415',
            color: '#f87171',
            fontSize: 12,
          }}
        >
          <Trash2 size={13} />
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: 420, padding: 24, background: '#101726', border: '1px solid #1e293b', borderRadius: 8 }}>
        <h3 style={{ color: '#f8fafc', marginBottom: 16, fontSize: 16, fontWeight: 700 }}>Новый дашборд</h3>
        {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12, padding: 8, background: '#ef444415', borderRadius: 4 }}>{error}</div>}
        <input
          placeholder="Название *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          style={inputStyle}
        />
        <textarea
          placeholder="Описание"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}>
          <input
            type="checkbox"
            checked={form.is_public}
            onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked }))}
          />
          Публичный (доступен всем операторам)
        </label>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1e293b', color: '#94a3b8', fontSize: 12, fontWeight: 600 }}
          >
            Отмена
          </button>
          <button
            onClick={submit}
            disabled={loading}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              background: '#2563eb',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {loading ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Dashboards() {
  const [mounted, setMounted] = useState(false)
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

  useEffect(() => {
    setMounted(true)
    load()
  }, [])

  if (!mounted) return null

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 7, borderRadius: 6, background: '#2563eb18', color: '#38bdf8' }}>
                  <LayoutDashboard size={20} />
                </div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  Дашборды
                </h1>
              </div>
              <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 0' }}>
                Персональные и командные экраны мониторинга сервисов
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
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
              <Plus size={14} /> Новый дашборд
            </button>
          </div>

          {loading && <div style={{ color: '#64748b', fontSize: 13, padding: 40, textAlign: 'center' }}>Загрузка...</div>}
          {error && <div style={{ color: '#f87171', marginBottom: 12, padding: 10, background: '#ef444415', borderRadius: 6 }}>Ошибка: {error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {dashboards.map((d) => (
              <DashboardCard
                key={d.id}
                dash={d}
                onOpen={(id) => router.push(`/dashboards/${id}`)}
                onDelete={deleteDash}
              />
            ))}
          </div>

          {!loading && dashboards.length === 0 && (
            <div style={{ textAlign: 'center', padding: 80, background: '#101726', border: '1px solid #1e293b', borderRadius: 8 }}>
              <div style={{ padding: 12, borderRadius: 10, background: '#2563eb15', color: '#38bdf8', display: 'inline-block', marginBottom: 12 }}>
                <LayoutDashboard size={32} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 6 }}>Нет созданных дашбордов</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 20 }}>Создайте первую панель и добавьте кастомные виджеты графиков и доступности</div>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                }}
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

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 4,
  border: '1px solid #1e293b',
  background: '#090d16',
  color: '#f8fafc',
  fontSize: 12,
  marginBottom: 10,
  outline: 'none',
  boxSizing: 'border-box',
}
