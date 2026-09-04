import { useEffect, useState } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

function UptimeBadge({ pct }) {
  if (pct === null || pct === undefined) return <span style={{ color: '#9aa4b2' }}>—</span>
  const color = pct >= 99.9 ? '#4ade80' : pct >= 99.0 ? '#facc15' : '#ef4444'
  return (
    <span style={{ color, fontWeight: 700 }}>
      {pct.toFixed(3)}%
    </span>
  )
}

const STATUS_STYLE = {
  green: { bg: '#166534', fg: '#4ade80', label: 'OK' },
  yellow: { bg: '#854d0e', fg: '#facc15', label: 'Предупреждение' },
  red: { bg: '#7f1d1d', fg: '#ef4444', label: 'Нарушение' },
  gray: { bg: '#1e2330', fg: '#9aa4b2', label: 'Нет данных' },
}

function StatCard({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: 16, minWidth: 140 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>{value ?? '—'}</div>
      <div style={{ fontSize: 11, color: '#9aa4b2', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function SLA() {
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const loadSummary = async () => {
    try {
      setError(null)
      const res = await apiFetch('/api/sla/summary')
      setSummary(res.summary || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadDetail = async (item) => {
    setSelected(item)
    setDetailLoading(true)
    try {
      const res = await apiFetch(`/api/sla/${item.target_type}/${item.target_id}?days=30`)
      setDetail(res)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    loadSummary()
    const t = setInterval(loadSummary, 60000)
    return () => clearInterval(t)
  }, [])

  const filtered = summary.filter(item => {
    if (filter === 'all') return true
    if (filter === 'servers') return item.target_type === 'server'
    if (filter === 'websites') return item.target_type === 'website'
    if (filter === 'critical') return item.color_30d === 'red'
    return true
  })

  // Only average/count items that actually have a computed uptime_30d —
  // treating "no data yet" as 100% (or as a violation) would contradict
  // the per-row status badge, which shows a neutral "no data" state instead.
  const withData = filtered.filter(i => i.uptime_30d !== null && i.uptime_30d !== undefined)
  const avgUptime = withData.length
    ? (withData.reduce((s, i) => s + i.uptime_30d, 0) / withData.length).toFixed(3)
    : null
  const belowSla = withData.filter(i => i.uptime_30d < 99.9).length
  const perfect = withData.filter(i => i.uptime_30d >= 99.9).length

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#0f1117' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>SLA / Uptime</h1>
            <p style={{ color: '#64748b', fontSize: 13 }}>Доступность серверов и сайтов за 30 дней</p>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <StatCard label="Средний uptime (30д)" value={avgUptime ? `${avgUptime}%` : '—'} />
            <StatCard label="Ниже 99.9%" value={belowSla} sub="требуют внимания" />
            <StatCard label="Идеальный uptime" value={perfect} sub="≥ 99.9%" />
            <StatCard label="Всего объектов" value={filtered.length} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {['all', 'servers', 'websites', 'critical'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: filter === f ? '#3b82f6' : '#1e2330',
                  color: filter === f ? '#fff' : '#9aa4b2', fontSize: 13,
                }}
              >
                {{ all: 'Все', servers: 'Серверы', websites: 'Сайты', critical: 'Критичные' }[f]}
              </button>
            ))}
            <button onClick={loadSummary} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1e2330', color: '#9aa4b2', fontSize: 13 }}>
              Обновить
            </button>
          </div>

          {loading && <div style={{ color: '#9aa4b2' }}>Загрузка...</div>}
          {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>Ошибка: {error}</div>}

          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e2330' }}>
                    {['Объект', 'Тип', '24 часа', '7 дней', '30 дней', 'Статус'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr
                      key={`${item.target_type}-${item.target_id}`}
                      onClick={() => loadDetail(item)}
                      style={{
                        borderBottom: '1px solid #1a1f2e', cursor: 'pointer',
                        background: selected?.target_id === item.target_id ? '#1e2330' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#1e2330'}
                      onMouseLeave={e => e.currentTarget.style.background = selected?.target_id === item.target_id ? '#1e2330' : 'transparent'}
                    >
                      <td style={{ padding: '10px 12px', color: '#e2e8f0', fontWeight: 500 }}>{item.target_name}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{item.target_type === 'server' ? '🖥' : '🌐'} {item.target_type}</td>
                      <td style={{ padding: '10px 12px' }}><UptimeBadge pct={item.uptime_24h} /></td>
                      <td style={{ padding: '10px 12px' }}><UptimeBadge pct={item.uptime_7d} /></td>
                      <td style={{ padding: '10px 12px' }}><UptimeBadge pct={item.uptime_30d} /></td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: STATUS_STYLE[item.color_30d]?.bg ?? STATUS_STYLE.gray.bg,
                          color: STATUS_STYLE[item.color_30d]?.fg ?? STATUS_STYLE.gray.fg,
                        }}>
                          {STATUS_STYLE[item.color_30d]?.label ?? STATUS_STYLE.gray.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!loading && filtered.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>Нет данных</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {selected && (
              <div className="card" style={{ width: 320, padding: 20, flexShrink: 0 }}>
                <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{selected.target_name}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 16 }}>{selected.target_type}</div>
                {detailLoading ? (
                  <div style={{ color: '#9aa4b2', fontSize: 13 }}>Загрузка...</div>
                ) : detail ? (
                  <>
                    <div style={{ fontSize: 13, color: '#9aa4b2', marginBottom: 8 }}>Агрегированные данные (30д)</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#64748b' }}>Uptime</span>
                        <UptimeBadge pct={detail.aggregated?.uptime_pct} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#64748b' }}>Простой (мин)</span>
                        <span style={{ color: '#e2e8f0' }}>{detail.aggregated?.total_downtime_minutes ?? '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#64748b' }}>Avg отклик (мс)</span>
                        <span style={{ color: '#e2e8f0' }}>{detail.aggregated?.avg_response_ms ?? '—'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#64748b' }}>Точек данных</span>
                        <span style={{ color: '#e2e8f0' }}>{detail.history?.length ?? 0}</span>
                      </div>
                    </div>
                    {detail.history?.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>Последние 10 периодов</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {detail.history.slice(-10).reverse().map((r, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                              <span style={{ color: '#64748b' }}>{new Date(r.period_start).toLocaleDateString('ru')}</span>
                              <UptimeBadge pct={r.uptime_pct} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ color: '#9aa4b2', fontSize: 13 }}>Нет данных</div>
                )}
                <button
                  onClick={() => setSelected(null)}
                  style={{ marginTop: 16, width: '100%', padding: '6px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#1a1f2e', color: '#9aa4b2', fontSize: 12 }}
                >
                  Закрыть
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
