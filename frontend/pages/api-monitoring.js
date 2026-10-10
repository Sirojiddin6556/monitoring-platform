import { useEffect, useState, useMemo } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import HealthCheckPanel from '../components/HealthCheckPanel'
import apiFetch from '../lib/api'
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Clock,
  Globe,
  Search,
  Server
} from 'lucide-react'

function StatusBadge({ status }) {
  const isUp = status === 'up' || status === 'ok'
  const isDegraded = status === 'degraded' || status === 'warning'
  const color = isUp ? '#10b981' : isDegraded ? '#f59e0b' : '#ef4444'
  const bg = isUp ? '#10b98118' : isDegraded ? '#f59e0b18' : '#ef444418'
  const border = isUp ? '#10b98135' : isDegraded ? '#f59e0b35' : '#ef444435'
  const label = isUp ? 'ОНЛАЙН' : isDegraded ? 'ДЕГРАДАЦИЯ' : 'СБОЙ'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        borderRadius: 4,
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function StatCard({ title, value, sub, icon: Icon, color = '#2563eb' }) {
  return (
    <div
      style={{
        background: '#101726',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </span>
        {Icon && (
          <div style={{ padding: 6, borderRadius: 6, background: `${color}18`, color }}>
            <Icon size={16} />
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', lineHeight: 1.1, fontFeatureSettings: '"tnum"' }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function ApiMonitoringPage() {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(null)
  const [recent, setRecent] = useState([])
  const [manualTarget, setManualTarget] = useState('')
  const [search, setSearch] = useState('')

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/api/api-monitoring/status')
      setCurrent(data.current || null)
      setRecent(data.recent || [])
    } catch (e) {
      setError(e.message || 'Не удалось загрузить данные API-мониторинга')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    setMounted(true)
    load()
    const t = setInterval(() => load({ silent: true }), 15000)
    return () => clearInterval(t)
  }, [])

  const runCheckNow = async () => {
    setRefreshing(true)
    try {
      await apiFetch('/api/api-monitoring/check', { method: 'POST' })
      await load({ silent: true })
    } catch (e) {
      setError(e.message || 'Не удалось запустить внеплановую проверку')
    } finally {
      setRefreshing(false)
    }
  }

  const checks = current?.checks || []
  const summary = current?.summary || { total: 0, up: 0, down: 0, avg_latency_ms: 0, uptime_seconds: 0 }
  const uptimeHours = summary.uptime_seconds ? (summary.uptime_seconds / 3600).toFixed(1) : '0.0'

  const filteredChecks = useMemo(() => {
    if (!search.trim()) return checks
    const q = search.toLowerCase()
    return checks.filter(
      (c) =>
        (c.endpoint || '').toLowerCase().includes(q) ||
        (c.url || '').toLowerCase().includes(q) ||
        String(c.status_code || '').includes(q)
    )
  }, [checks, search])

  if (!mounted) return null

  return (
    <ProtectedRoute requiredRole="admin">
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ padding: 7, borderRadius: 6, background: '#2563eb18', color: '#38bdf8' }}>
                  <Activity size={20} />
                </div>
                <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  API Мониторинг
                </h1>
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                Непрерывный синтетический аудит внутренних эндпоинтов и маршрутов платформы
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {current?.status && <StatusBadge status={current.status} />}
              <button
                onClick={runCheckNow}
                disabled={refreshing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: '1px solid #1e293b',
                  background: refreshing ? '#1e293b' : '#2563eb',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: refreshing ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                {refreshing ? 'Проверка...' : 'Проверить сейчас'}
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 6,
                background: '#ef444415',
                border: '1px solid #ef444440',
                color: '#f87171',
                fontSize: 13,
                marginBottom: 20,
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              Загрузка телеметрии API...
            </div>
          ) : (
            <>
              {/* Stat Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
                <StatCard
                  title="Всего эндпоинтов"
                  value={summary.total}
                  sub={`База: ${current?.base_url || 'локально'}`}
                  icon={Globe}
                  color="#2563eb"
                />
                <StatCard
                  title="Доступно"
                  value={summary.up}
                  sub="Ответ получен штатно"
                  icon={CheckCircle2}
                  color="#10b981"
                />
                <StatCard
                  title="Сбои"
                  value={summary.down}
                  sub="Таймаут или HTTP 5xx"
                  icon={XCircle}
                  color="#ef4444"
                />
                <StatCard
                  title="Средний отклик"
                  value={`${summary.avg_latency_ms || 0} мс`}
                  sub={`Аптайм: ${uptimeHours} ч`}
                  icon={Clock}
                  color="#38bdf8"
                />
              </div>

              {/* Endpoints Table */}
              <div
                style={{
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  marginBottom: 20,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid #1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                    Результаты проверки маршрутов ({filteredChecks.length})
                  </div>
                  <div style={{ position: 'relative', width: 220 }}>
                    <Search size={13} style={{ position: 'absolute', left: 10, top: 10, color: '#64748b' }} />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Поиск по URL или коду..."
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 30px',
                        background: '#090d16',
                        border: '1px solid #1e293b',
                        borderRadius: 4,
                        color: '#f8fafc',
                        fontSize: 12,
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', color: '#64748b', textAlign: 'left' }}>
                        <th style={{ padding: '10px 16px', fontWeight: 600 }}>Эндпоинт</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600 }}>Полный URL</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600 }}>HTTP код</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600 }}>Задержка</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600 }}>Статус</th>
                        <th style={{ padding: '10px 16px', fontWeight: 600 }}>Диагностика</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredChecks.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                            Эндпоинты не найдены
                          </td>
                        </tr>
                      ) : (
                        filteredChecks.map((c, i) => (
                          <tr
                            key={`${c.endpoint}-${i}`}
                            style={{
                              borderBottom: '1px solid #1e293b30',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            <td style={{ padding: '10px 16px', fontWeight: 600, color: '#f8fafc', fontFamily: 'monospace' }}>
                              {c.endpoint}
                            </td>
                            <td style={{ padding: '10px 16px', color: '#94a3b8', fontSize: 11 }}>
                              {c.url}
                            </td>
                            <td style={{ padding: '10px 16px', fontFeatureSettings: '"tnum"' }}>
                              <span
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: 3,
                                  background: c.status_code >= 400 ? '#ef444420' : '#10b98120',
                                  color: c.status_code >= 400 ? '#ef4444' : '#10b981',
                                  fontSize: 11,
                                  fontWeight: 700,
                                }}
                              >
                                {c.status_code ?? '—'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 16px', color: '#94a3b8', fontFeatureSettings: '"tnum"' }}>
                              {c.latency_ms} мс
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              {c.ok ? (
                                <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 11 }}>
                                  <CheckCircle2 size={12} /> OK
                                </span>
                              ) : (
                                <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 11 }}>
                                  <XCircle size={12} /> СБОЙ
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 16px', color: c.error ? '#f87171' : '#64748b', fontSize: 11 }}>
                              {c.error || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* History & Manual Diagnostic */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
                {/* Recent History */}
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: '16px 18px',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 12 }}>
                    Журнал последних проверок
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                    {[...recent].reverse().map((row, idx) => (
                      <div
                        key={`${row.timestamp}-${idx}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '150px 100px 1fr 90px',
                          gap: 10,
                          alignItems: 'center',
                          padding: '8px 10px',
                          borderRadius: 4,
                          background: '#090d16',
                          border: '1px solid #1e293b20',
                          fontSize: 11,
                        }}
                      >
                        <span style={{ color: '#94a3b8' }}>
                          {row.timestamp ? new Date(row.timestamp * 1000).toLocaleTimeString('ru-RU') : '—'}
                        </span>
                        <span><StatusBadge status={row.status} /></span>
                        <span style={{ color: '#64748b' }}>
                          {row.summary?.up || 0} / {row.summary?.total || 0} доступно
                        </span>
                        <span style={{ color: '#38bdf8', fontFeatureSettings: '"tnum"', textAlign: 'right' }}>
                          {row.summary?.avg_latency_ms || 0} мс
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Manual Check */}
                <div
                  style={{
                    background: '#101726',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: '16px 18px',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 12 }}>
                    Ручная диагностика произвольного хоста
                  </div>
                  <input
                    value={manualTarget}
                    onChange={(e) => setManualTarget(e.target.value)}
                    placeholder="Введите хост или IP (например, 192.168.17.51 или yandex.ru)"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: 4,
                      border: '1px solid #1e293b',
                      background: '#090d16',
                      color: '#f8fafc',
                      fontSize: 12,
                      marginBottom: 12,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <HealthCheckPanel target={manualTarget} title="Проверка портов и протоколов" />
                </div>
              </div>
            </>
          )}
        </main>
      </div>
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </ProtectedRoute>
  )
}
