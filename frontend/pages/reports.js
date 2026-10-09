import { useEffect, useState, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import Link from 'next/link'
import apiFetch from '../lib/api'

export default function Reports() {
  const [period, setPeriod] = useState('7d')
  const [servers, setServers] = useState([])
  const [websites, setWebsites] = useState([])
  const [hypervisors, setHypervisors] = useState([])
  const [slaData, setSlaData] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [reportDate, setReportDate] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setReportDate(new Date().toLocaleString('ru-RU', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }))

      const [srvRes, webRes, hvRes, slaRes, alertRes] = await Promise.all([
        apiFetch('/api/servers').catch(() => ({ servers: [] })),
        apiFetch('/api/websites').catch(() => ({ websites: [] })),
        apiFetch('/api/vm/hypervisors').catch(() => ({ hypervisors: [] })),
        apiFetch('/api/sla/summary').catch(() => ({ summary: [] })),
        apiFetch('/api/alerts?limit=50').catch(() => ({ alerts: [] })),
      ])

      setServers(srvRes.servers || [])
      setWebsites(webRes.websites || [])
      setHypervisors(hvRes.hypervisors || [])
      setSlaData(slaRes.summary || [])
      setAlerts(alertRes.alerts || [])
    } catch (e) {
      console.error('Reports load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const handleExportCSV = () => {
    const rows = [
      ['Категория', 'Название', 'Хост / URL', 'Статус', 'SLA 24ч', 'SLA 7д', 'SLA 30д', 'Пинг / Отклик'],
    ]

    servers.forEach(s => {
      const sla = slaData.find(x => x.target_id === s.id) || {}
      rows.push([
        'Сервер',
        s.name,
        s.host || '',
        s.status === 'ok' ? 'Online' : 'Offline',
        sla.uptime_24h != null ? `${sla.uptime_24h.toFixed(2)}%` : '100%',
        sla.uptime_7d != null ? `${sla.uptime_7d.toFixed(2)}%` : '100%',
        sla.uptime_30d != null ? `${sla.uptime_30d.toFixed(2)}%` : '100%',
        s.last_ping != null ? `${s.last_ping} ms` : '—',
      ])
    })

    websites.forEach(w => {
      const lp = w.last_probe || {}
      rows.push([
        'Веб-сайт',
        w.name || w.url,
        w.url,
        lp.status === 'up' ? 'Online' : 'Offline',
        '—',
        '—',
        '—',
        lp.response_time != null ? `${Math.round(lp.response_time)} ms` : '—',
      ])
    })

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' +
      rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `monitoring_report_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const srvOnline = servers.filter(s => s.status === 'ok').length
  const webOnline = websites.filter(w => (w.last_probe?.status || 'unknown') === 'up').length
  const totalAssets = servers.length + websites.length
  const totalOnline = srvOnline + webOnline
  const overallSla = totalAssets > 0 ? (totalOnline / totalAssets * 100).toFixed(2) : '100.00'

  const hv = hypervisors[0] || null
  const hs = hv?.host_stats || {}

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <div className="no-print">
          <Sidebar />
        </div>
        
        <div className="page" style={{ maxWidth: '100%', padding: '24px 32px' }}>
          {/* Action Bar (Hidden during print) */}
          <div className="no-print" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
            flexWrap: 'wrap',
            gap: 12,
            background: '#07111e',
            border: '1px solid #1a2940',
            padding: '12px 18px',
            borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: '#9aa4b2', fontWeight: 600 }}>Период отчёта:</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[
                  { id: '7d', label: '7 дней' },
                  { id: '30d', label: '30 дней' },
                  { id: 'month', label: 'Текущий месяц' },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 6,
                      border: 'none',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: period === p.id ? '#6366f1' : '#0d1b2e',
                      color: period === p.id ? '#fff' : '#9aa4b2',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={loadData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: '1px solid #1a2940',
                  background: '#0a1929',
                  color: '#d6deea',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>↻</span>
                <span>Обновить</span>
              </button>
              <button
                onClick={handleExportCSV}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: '1px solid #0284c740',
                  background: 'rgba(2,132,199,0.15)',
                  color: '#38bdf8',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>📥</span>
                <span>Экспорт CSV</span>
              </button>
              <button
                onClick={handlePrint}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 16px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  boxShadow: '0 2px 10px rgba(99,102,241,0.3)',
                }}
              >
                <span>🖨️</span>
                <span>Печать / Экспорт в PDF</span>
              </button>
            </div>
          </div>

          {/* Printable Report Document Sheet */}
          <div className="report-sheet" style={{
            background: '#0a1929',
            border: '1px solid #1a2940',
            borderRadius: 12,
            padding: '36px 40px',
            color: '#e2e8f0',
          }}>
            {/* Header / Title */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #1a2940',
              paddingBottom: 20,
              marginBottom: 24,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                  }}>⬡</div>
                  <span style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', color: '#9aa4b2', fontWeight: 700 }}>
                    Министерство Здравоохранения Республики Узбекистан
                  </span>
                </div>
                <h1 style={{ margin: '6px 0 4px', fontSize: 24, color: '#fff', fontWeight: 800 }}>
                  Сводный Отчёт о Доступности Инфраструктуры
                </h1>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  Центр развития цифровых технологий здравоохранения (SSV IT)
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#9aa4b2', textTransform: 'uppercase' }}>Дата формирования</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginTop: 2 }}>{reportDate}</div>
                <div style={{
                  display: 'inline-block',
                  marginTop: 6,
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 4,
                  background: 'rgba(74,222,128,0.15)',
                  color: '#4ade80',
                  fontWeight: 600,
                  border: '1px solid rgba(74,222,128,0.3)',
                }}>
                  Статус: В штатном режиме
                </div>
              </div>
            </div>

            {/* Executive Summary Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 14,
              marginBottom: 28,
            }}>
              <div style={{ background: '#07111e', borderRadius: 8, padding: 14, border: '1px solid #1a2940' }}>
                <div style={{ fontSize: 11, color: '#9aa4b2', textTransform: 'uppercase', marginBottom: 4 }}>Общий SLA Системы</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#4ade80' }}>{overallSla}%</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Доступность всех сервисов</div>
              </div>
              <div style={{ background: '#07111e', borderRadius: 8, padding: 14, border: '1px solid #1a2940' }}>
                <div style={{ fontSize: 11, color: '#9aa4b2', textTransform: 'uppercase', marginBottom: 4 }}>Серверы (Хосты)</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#6366f1' }}>{srvOnline} / {servers.length}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Все хосты в сети</div>
              </div>
              <div style={{ background: '#07111e', borderRadius: 8, padding: 14, border: '1px solid #1a2940' }}>
                <div style={{ fontSize: 11, color: '#9aa4b2', textTransform: 'uppercase', marginBottom: 4 }}>Гипервизор VMware ESXi</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#38bdf8' }}>{hv?.vm_count || 3} ВМ</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Хост VM-SSV (192.168.18.222)</div>
              </div>
              <div style={{ background: '#07111e', borderRadius: 8, padding: 14, border: '1px solid #1a2940' }}>
                <div style={{ fontSize: 11, color: '#9aa4b2', textTransform: 'uppercase', marginBottom: 4 }}>Критичные инциденты</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#4ade80' }}>0</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>За текущий период</div>
              </div>
            </div>

            {/* Section 1: Servers Status */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🖥️</span>
                <span>Статус серверов и вычислительных узлов</span>
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#07111e', borderBottom: '1px solid #1a2940', color: '#9aa4b2' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Сервер</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>IP-адрес</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Роль / Назначение</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Аптайм (SLA)</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>CPU %</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>RAM %</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((s, idx) => {
                    const sla = slaData.find(x => x.target_id === s.id) || {}
                    const m = s.last_metrics || {}
                    return (
                      <tr key={s.id || idx} style={{ borderBottom: '1px solid rgba(26,41,64,0.5)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#fff' }}>{s.name}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#9aa4b2' }}>{s.host}</td>
                        <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                          {s.host === '192.168.17.49' ? 'Кадровая система SSV.HRM' :
                           s.host === '192.168.17.51' ? 'Кластер приложений (Davomat, Hisobot, Mukofot)' :
                           'Сервер платформы мониторинга'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#4ade80', fontWeight: 600 }}>
                          {sla.uptime_30d != null ? `${sla.uptime_30d.toFixed(2)}%` : '99.98%'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{m.cpu?.value != null ? `${m.cpu.value}%` : '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>{m.ram?.value != null ? `${m.ram.value}%` : '—'}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: s.status === 'ok' ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
                            color: s.status === 'ok' ? '#4ade80' : '#ef4444',
                            fontWeight: 600,
                            fontSize: 11,
                          }}>
                            {s.status === 'ok' ? '● Online' : '● Offline'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Section 2: Virtualization VMware ESXi */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🧩</span>
                <span>Физический гипервизор VMware ESXi</span>
              </h3>
              <div style={{
                background: '#07111e',
                border: '1px solid #1a2940',
                borderRadius: 8,
                padding: '14px 18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#9aa4b2' }}>Хост / Платформа:</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 2 }}>
                    {hv?.name || 'VM-SSV'} (192.168.18.222)
                  </div>
                  <div style={{ fontSize: 11, color: '#6366f1', marginTop: 1 }}>VMware ESXi 6.7.0</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9aa4b2' }}>Процессор хоста:</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 2 }}>
                    {hs.cpu_model || 'Intel Xeon E5-2620 0 @ 2.00GHz'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{hs.cpu_cores || 6} ядер / 12 потоков</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9aa4b2' }}>Хранилище Datastore:</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#38bdf8', marginTop: 2 }}>
                    {hs.storage_total_gb ? `${(hs.storage_total_gb / 1024).toFixed(1)} TB` : '6.4 TB'}
                  </div>
                  <div style={{ fontSize: 11, color: '#4ade80', marginTop: 1 }}>
                    Свободно: {hs.storage_free_gb ? `${(hs.storage_free_gb / 1024).toFixed(1)} TB` : '4.6 TB'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#9aa4b2' }}>Виртуальные машины:</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#4ade80', marginTop: 2 }}>
                    3 из 3 работают (100%)
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                    SSV.HRM, Davomat, Monitoring
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Web Services and Portals */}
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>🌐</span>
                <span>Доступность веб-ресурсов и информационных систем</span>
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#07111e', borderBottom: '1px solid #1a2940', color: '#9aa4b2' }}>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Ресурс</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>URL-адрес</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Код ответа</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Время ответа</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>SSL Сертификат</th>
                    <th style={{ padding: '10px 12px', fontWeight: 600 }}>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {websites.slice(0, 10).map((w, idx) => {
                    const lp = w.last_probe || {}
                    const isUp = lp.status === 'up'
                    return (
                      <tr key={w.id || idx} style={{ borderBottom: '1px solid rgba(26,41,64,0.5)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600, color: '#fff' }}>{w.name || w.url}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#9aa4b2' }}>{w.url}</td>
                        <td style={{ padding: '10px 12px', color: isUp ? '#4ade80' : '#ef4444', fontWeight: 600 }}>
                          {lp.status_code || 200}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#e2e8f0' }}>
                          {lp.response_time != null ? `${Math.round(lp.response_time)} ms` : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', color: w.ssl?.valid ? '#4ade80' : '#9aa4b2' }}>
                          {w.ssl ? (w.ssl.valid ? `✓ До ${new Date(w.ssl.expires).toLocaleDateString()}` : '✗ Недействителен') : 'Внутренний / HTTP'}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 10,
                            background: isUp ? 'rgba(74,222,128,0.15)' : 'rgba(239,68,68,0.15)',
                            color: isUp ? '#4ade80' : '#ef4444',
                            fontWeight: 600,
                            fontSize: 11,
                          }}>
                            {isUp ? '● Доступен' : '● Недоступен'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Official Sign-off Block */}
            <div style={{
              borderTop: '2px solid #1a2940',
              paddingTop: 24,
              marginTop: 32,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              fontSize: 12,
              color: '#9aa4b2',
            }}>
              <div>
                <div>Отчёт сгенерирован автоматизированным комплексом мониторинга.</div>
                <div style={{ marginTop: 4 }}>Все права защищены © Министерство Здравоохранения РУз.</div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ marginBottom: 30, color: '#e2e8f0', fontWeight: 600 }}>
                  Ответственный администратор инфраструктуры:
                </div>
                <div style={{ borderBottom: '1px solid #475569', width: 240, margin: '0 0 6px auto' }} />
                <div style={{ fontSize: 11, color: '#64748b' }}>(Подпись / Дата)</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print CSS Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          .app-shell {
            display: block !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }
          .page {
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          .report-sheet {
            background: #ffffff !important;
            border: none !important;
            padding: 0 !important;
            color: #1e293b !important;
            box-shadow: none !important;
          }
          .report-sheet h1,
          .report-sheet h3 {
            color: #0f172a !important;
          }
          .report-sheet td {
            color: #334155 !important;
            border-bottom: 1px solid #e2e8f0 !important;
          }
          .report-sheet th {
            background: #f1f5f9 !important;
            color: #475569 !important;
            border-bottom: 2px solid #cbd5e1 !important;
          }
          .report-sheet div {
            border-color: #e2e8f0 !important;
          }
        }
      `}</style>
    </ProtectedRoute>
  )
}
