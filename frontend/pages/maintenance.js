import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Wrench,
  Clock,
  Calendar,
  BellOff,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Archive,
  Trash2,
  X,
  Target,
} from 'lucide-react'

function formatDate(iso, mounted) {
  if (!iso || !mounted) return '—'
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function WindowCard({ w, onCancel, mounted }) {
  const now = new Date()
  const start = new Date(w.start_at)
  const end = new Date(w.end_at)
  const isActive = w.is_active && start <= now && end >= now
  const isPast = end < now
  const isFuture = start > now

  const statusColor = isActive ? '#10b981' : isPast ? '#64748b' : '#f59e0b'
  const statusBg = isActive ? '#10b98115' : isPast ? '#64748b15' : '#f59e0b15'
  const statusBorder = isActive ? '#10b98130' : isPast ? '#64748b30' : '#f59e0b30'
  const statusLabel = isActive ? 'Активно сейчас' : isPast ? 'Завершено' : 'Запланировано'

  return (
    <div
      style={{
        background: '#101726',
        border: '1px solid #1e293b',
        borderLeft: `4px solid ${statusColor}`,
        borderRadius: 8,
        padding: '14px 18px',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: 14 }}>
            {w.name}
          </span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 4,
              background: statusBg,
              border: `1px solid ${statusBorder}`,
              color: statusColor,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {statusLabel}
          </span>
          {w.suppress_alerts && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 4,
                background: '#818cf815',
                border: '1px solid #818cf830',
                color: '#818cf8',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              <BellOff size={11} />
              Алерты подавляются
            </span>
          )}
        </div>

        {w.description && (
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, lineHeight: 1.4 }}>
            {w.description}
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#64748b', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar size={12} />
            Интервал: {formatDate(w.start_at, mounted)} — {formatDate(w.end_at, mounted)}
          </span>
          {w.target_type && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Target size={12} />
              Объекты: {w.target_type === 'all' ? 'Вся инфраструктура' : w.target_type}
              {w.target_ids?.length ? ` (${w.target_ids.length} шт.)` : ''}
            </span>
          )}
        </div>
      </div>

      {w.is_active && !isPast && (
        <button
          onClick={() => onCancel(w.id)}
          title="Отменить окно обслуживания"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #ef444440',
            background: '#090d16',
            color: '#ef4444',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Trash2 size={12} />
          Отменить
        </button>
      )}
    </div>
  )
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    start_at: '',
    end_at: '',
    target_type: 'all',
    target_ids: '',
    suppress_alerts: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const now = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const fmt = (d) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

    const start = new Date(now.getTime() + 10 * 60 * 1000)
    const end = new Date(now.getTime() + 70 * 60 * 1000)
    setForm((f) => ({
      ...f,
      start_at: fmt(start),
      end_at: fmt(end),
    }))
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setError('Название окна обслуживания обязательно')
    if (!form.start_at || !form.end_at) return setError('Укажите время начала и окончания')
    setLoading(true)
    setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        start_at: new Date(form.start_at).toISOString(),
        end_at: new Date(form.end_at).toISOString(),
        target_type: form.target_type,
        target_ids: form.target_ids ? form.target_ids.split(',').map((s) => s.trim()).filter(Boolean) : [],
        suppress_alerts: form.suppress_alerts,
      }
      await apiFetch('/api/maintenance', { method: 'POST', body: JSON.stringify(payload) })
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message || 'Ошибка создания окна обслуживания')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#101726',
          border: '1px solid #1e293b',
          borderRadius: 8,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #1e293b',
            background: '#0d1320',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wrench size={18} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>
              Новое окно обслуживания
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: 20 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: '#ef444415',
                border: '1px solid #ef444430',
                borderRadius: 6,
                color: '#ef4444',
                fontSize: 12,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
              Название регламентных работ *
            </label>
            <input
              type="text"
              placeholder="Плановое обновление ядра OS и PostgreSQL"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: 6,
                color: '#f8fafc',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
              Описание работ
            </label>
            <textarea
              rows={2}
              placeholder="Краткий план работ и ответственные инженеры..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                background: '#090d16',
                border: '1px solid #1e293b',
                borderRadius: 6,
                color: '#f8fafc',
                fontSize: 13,
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                Начало *
              </label>
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  color: '#f8fafc',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                Окончание *
              </label>
              <input
                type="datetime-local"
                value={form.end_at}
                onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  color: '#f8fafc',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                Тип цели
              </label>
              <select
                value={form.target_type}
                onChange={(e) => setForm({ ...form, target_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  color: '#f8fafc',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="all">Вся инфраструктура</option>
                <option value="server">Серверы</option>
                <option value="website">Веб-сайты</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                ID объектов (через запятую)
              </label>
              <input
                type="text"
                placeholder="srv-prod-01, srv-db-02"
                value={form.target_ids}
                onChange={(e) => setForm({ ...form, target_ids: e.target.value })}
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  background: '#090d16',
                  border: '1px solid #1e293b',
                  borderRadius: 6,
                  color: '#f8fafc',
                  fontSize: 12,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 20,
              cursor: 'pointer',
              fontSize: 13,
              color: '#cbd5e1',
            }}
          >
            <input
              type="checkbox"
              checked={form.suppress_alerts}
              onChange={(e) => setForm({ ...form, suppress_alerts: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#2563eb' }}
            />
            Подавлять отправку оповещений и алертов на время работ
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid #1e293b',
                background: '#090d16',
                color: '#94a3b8',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '8px 18px',
                borderRadius: 6,
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Создание...' : 'Запланировать окно'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Maintenance() {
  const [mounted, setMounted] = useState(false)
  const [windows, setWindows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [includePast, setIncludePast] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const load = async () => {
    try {
      setError(null)
      const res = await apiFetch(`/api/maintenance?include_past=${includePast}`)
      setWindows(res.windows || [])
    } catch (err) {
      setError(err.message || 'Ошибка загрузки окон обслуживания')
    } finally {
      setLoading(false)
    }
  }

  const cancelWindow = async (id) => {
    if (!confirm('Отменить это окно обслуживания?')) return
    try {
      await apiFetch(`/api/maintenance/${id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      alert(err.message || 'Ошибка при отмене окна')
    }
  }

  useEffect(() => {
    load()
  }, [includePast])

  const activeWindows = windows.filter((w) => {
    const now = new Date()
    return w.is_active && new Date(w.start_at) <= now && new Date(w.end_at) >= now
  })

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto', boxSizing: 'border-box' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Wrench size={22} color="#2563eb" />
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Технологические окна обслуживания
                </h1>
              </div>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>
                Плановые регламентные работы, подавление ложных алертов и исключение простоев из SLA
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={load}
                title="Обновить"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  borderRadius: 6,
                  border: '1px solid #1e293b',
                  background: '#101726',
                  color: '#94a3b8',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} />
                Обновить
              </button>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Plus size={14} />
                Запланировать окно
              </button>
            </div>
          </div>

          {/* Active Maintenance Notice */}
          {activeWindows.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                background: '#10b98115',
                border: '1px solid #10b98140',
                borderRadius: 8,
                color: '#10b981',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 16,
              }}
            >
              <CheckCircle2 size={16} />
              Внимание: Сейчас активно {activeWindows.length} окно обслуживания. Оповещения для затронутых узлов временно заглушены.
            </div>
          )}

          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              gap: 12,
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={includePast}
                onChange={(e) => setIncludePast(e.target.checked)}
                style={{ accentColor: '#2563eb' }}
              />
              Показывать завершенные регламентные окна
            </label>
          </div>

          {error && (
            <div
              style={{
                padding: '10px 14px',
                background: '#ef444415',
                border: '1px solid #ef444430',
                borderRadius: 6,
                color: '#ef4444',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* Windows List */}
          <div>
            {loading && windows.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
                Загрузка окон обслуживания...
              </div>
            ) : windows.length === 0 ? (
              <div
                style={{
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  padding: 48,
                  textAlign: 'center',
                  color: '#64748b',
                }}
              >
                <Wrench size={32} color="#2563eb" style={{ marginBottom: 12 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc', marginBottom: 4 }}>
                  Запланированных окон обслуживания нет
                </div>
                <div style={{ fontSize: 13 }}>
                  При проведении технических работ добавьте окно, чтобы избежать ложных срабатываний дежурной смены.
                </div>
              </div>
            ) : (
              windows.map((w) => (
                <WindowCard key={w.id} w={w} onCancel={cancelWindow} mounted={mounted} />
              ))
            )}
          </div>
        </main>
      </div>

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />
      )}
    </ProtectedRoute>
  )
}
