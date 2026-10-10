import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Server,
  Globe,
  RefreshCw,
  TrendingUp,
  Clock,
  BarChart3,
  X,
  ChevronRight,
  Filter,
  Layers,
} from 'lucide-react'

const STATUS_STYLE = {
  green:  { bg: '#10b98115', border: '#10b98130', fg: '#10b981', label: 'В норме (≥99.9%)' },
  yellow: { bg: '#f59e0b15', border: '#f59e0b30', fg: '#f59e0b', label: 'Внимание (99-99.9%)' },
  red:    { bg: '#ef444415', border: '#ef444430', fg: '#ef4444', label: 'Нарушение (<99%)' },
  gray:   { bg: '#64748b15', border: '#64748b30', fg: '#64748b', label: 'Нет данных' },
}

function UptimeBadge({ pct }) {
  if (pct == null) {
    return <span style={{ color: '#64748b', fontSize: 12 }}>—</span>
  }
  const color = pct >= 99.9 ? '#10b981' : pct >= 99.0 ? '#f59e0b' : '#ef4444'
  const bg = pct >= 99.9 ? '#10b98115' : pct >= 99.0 ? '#f59e0b15' : '#ef444415'
  const border = pct >= 99.9 ? '#10b98130' : pct >= 99.0 ? '#f59e0b30' : '#ef444430'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 4,
        background: bg,
        border: `1px solid ${border}`,
        color: color,
        fontSize: 12,
        fontWeight: 700,
        fontFeatureSettings: '"tnum"',
      }}
    >
      {pct.toFixed(2)}%
    </span>
  )
}

function StatCard({ label, value, sub, icon: Icon, color = '#2563eb' }) {
  return (
    <div
      style={{
        background: '#101726',
        border: '1px solid #1e293b',
        borderRadius: 8,
        padding: '14px 18px',
        flex: 1,
        minWidth: 180,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        {Icon && <Icon size={14} color={color} />}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#f8fafc', fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

export default function SLA() {
  const [mounted, setMounted] = useState(false)
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadSummary = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/sla/summary')
      setSummary(res.summary || [])
    } catch (err) {
      setError(err.message || 'Ошибка загрузки отчета SLA')
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (item) => {
    setSelected(item)
    setDetailLoading(true)
    try {
      const res = await apiFetch(`/api/sla/${item.target_type}/${item.target_id}`)
      setDetail(res)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    loadSummary()
  }, [])

  const filtered = summary.filter((item) => {
    if (filter === 'servers') return item.target_type === 'server'
    if (filter === 'websites') return item.target_type === 'website'
    if (filter === 'critical') return item.color_30d === 'red' || item.color_30d === 'yellow'
    return true
  })

  const valid30d = summary.filter((i) => i.uptime_30d != null)
  const avgUptime = valid30d.length
    ? (valid30d.reduce((s, i) => s + i.uptime_30d, 0) / valid30d.length).toFixed(2)
    : null
  const belowSla = summary.filter((i) => i.uptime_30d != null && i.uptime_30d < 99.9).length
  const perfect = summary.filter((i) => i.uptime_30d != null && i.uptime_30d >= 99.9).length

  const formatDate = (isoStr) => {
    if (!mounted || !isoStr) return '—'
    try {
      return new Date(isoStr).toLocaleDateString('ru-RU')
    } catch {
      return isoStr
    }
  }

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
                <ShieldCheck size={22} color="#2563eb" />
                <h1 style={{ fontSize: 20, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  Соглашение об уровне обслуживания (SLA)
                </h1>
              </div>
              <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0 0' }}>
                Мониторинг доступности (Uptime), соблюдения контрактных параметров и истории деградаций за 30 дней
              </p>
            </div>

            <button
              onClick={loadSummary}
              title="Обновить отчет"
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
          </div>

          {/* Quick Metrics */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <StatCard
              label="Средний uptime (30д)"
              value={avgUptime ? `${avgUptime}%` : '—'}
              sub="По всей инфраструктуре"
              icon={TrendingUp}
              color="#2563eb"
            />
            <StatCard
              label="Ниже нормы (<99.9%)"
              value={belowSla}
              sub="Требуют внимания и оптимизации"
              icon={AlertTriangle}
              color="#ef4444"
            />
            <StatCard
              label="В пределах нормы"
              value={perfect}
              sub="≥ 99.9% доступности"
              icon={CheckCircle2}
              color="#10b981"
            />
            <StatCard
              label="Контролируемых объектов"
              value={summary.length}
              sub="Серверы и веб-сервисы"
              icon={BarChart3}
              color="#38bdf8"
            />
          </div>

          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 16,
              flexWrap: 'wrap',
            }}
          >
            {[
              { id: 'all', label: 'Все объекты' },
              { id: 'servers', label: 'Серверы' },
              { id: 'websites', label: 'Веб-сайты' },
              { id: 'critical', label: 'С нарушениями SLA' },
            ].map((f) => {
              const active = filter === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: `1px solid ${active ? '#2563eb' : '#1e293b'}`,
                    background: active ? '#2563eb' : '#101726',
                    color: active ? '#ffffff' : '#94a3b8',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {f.label}
                </button>
              )
            })}
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
              Ошибка: {error}
            </div>
          )}

          {/* Table & Details Panel */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                background: '#101726',
                border: '1px solid #1e293b',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0d1320', borderBottom: '1px solid #1e293b' }}>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Объект
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Тип
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      24 часа
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      7 дней
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      30 дней
                    </th>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
                      Статус соответствия
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        Загрузка показателей SLA...
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        Нет данных, удовлетворяющих фильтру
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item) => {
                      const isSelected = selected?.target_id === item.target_id
                      const st = STATUS_STYLE[item.color_30d] || STATUS_STYLE.gray
                      const isServer = item.target_type === 'server'

                      return (
                        <tr
                          key={`${item.target_type}-${item.target_id}`}
                          onClick={() => loadDetail(item)}
                          style={{
                            borderBottom: '1px solid #1e293b',
                            cursor: 'pointer',
                            background: isSelected ? '#151d2f' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          <td style={{ padding: '12px 14px', color: '#f8fafc', fontWeight: 600 }}>
                            {item.target_name}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: 11,
                                padding: '2px 6px',
                                background: '#090d16',
                                border: '1px solid #1e293b',
                                borderRadius: 4,
                              }}
                            >
                              {isServer ? <Server size={11} color="#38bdf8" /> : <Globe size={11} color="#818cf8" />}
                              {isServer ? 'Сервер' : 'Веб-сайт'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <UptimeBadge pct={item.uptime_24h} />
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <UptimeBadge pct={item.uptime_7d} />
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <UptimeBadge pct={item.uptime_30d} />
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600,
                                background: st.bg,
                                border: `1px solid ${st.border}`,
                                color: st.fg,
                              }}
                            >
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Selected Target SLA Detail Drawer */}
            {selected && (
              <div
                style={{
                  width: 340,
                  background: '#101726',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  flexShrink: 0,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: 15 }}>
                      {selected.target_name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {selected.target_type === 'server' ? 'Сервер инфраструктуры' : 'Веб-ресурс'}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 2 }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {detailLoading ? (
                  <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                    Загрузка детальной истории...
                  </div>
                ) : detail ? (
                  <>
                    <div
                      style={{
                        background: '#090d16',
                        border: '1px solid #1e293b',
                        borderRadius: 6,
                        padding: 12,
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>
                        Агрегированные данные (30 дней)
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: '#94a3b8' }}>Доступность (Uptime):</span>
                          <UptimeBadge pct={detail.aggregated?.uptime_pct} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Суммарный простой:</span>
                          <span style={{ color: '#f8fafc', fontWeight: 600, fontFeatureSettings: '"tnum"' }}>
                            {detail.aggregated?.total_downtime_minutes != null
                              ? `${detail.aggregated.total_downtime_minutes} мин`
                              : '0 мин'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Средний отклик:</span>
                          <span style={{ color: '#f8fafc', fontWeight: 600, fontFeatureSettings: '"tnum"' }}>
                            {detail.aggregated?.avg_response_ms != null
                              ? `${Number(detail.aggregated.avg_response_ms).toFixed(1)} мс`
                              : '—'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Зарегистрировано точек:</span>
                          <span style={{ color: '#94a3b8', fontFeatureSettings: '"tnum"' }}>
                            {detail.history?.length ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>

                    {detail.history?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
                          История по периодам (последние 10)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {detail.history.slice(-10).reverse().map((r, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '6px 8px',
                                background: '#090d16',
                                border: '1px solid #1e293b',
                                borderRadius: 4,
                                fontSize: 11,
                              }}
                            >
                              <span style={{ color: '#94a3b8' }}>
                                {formatDate(r.period_start)}
                              </span>
                              <UptimeBadge pct={r.uptime_pct} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: '#64748b', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
                    Детальная статистика отсутствует
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
