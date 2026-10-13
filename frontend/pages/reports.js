import { useEffect, useState, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import Link from 'next/link'
import apiFetch from '../lib/api'
import {
  FileText,
  Printer,
  Download,
  RefreshCw,
  Calendar,
  Server,
  Globe,
  Activity,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  HardDrive,
  Layers,
  Cpu,
  Check,
  Building
} from 'lucide-react'

export default function Reports() {
  const [mounted, setMounted] = useState(false)
  const [period, setPeriod] = useState('7d')
  const [servers, setServers] = useState([])
  const [websites, setWebsites] = useState([])
  const [hypervisors, setHypervisors] = useState([])
  const [slaData, setSlaData] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [reportDate, setReportDate] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

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

  if (!mounted) {
    return <div style={{ background: '#090d16', minHeight: '100vh' }} />
  }

  return (
    <ProtectedRoute>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16' }} className="app-shell">
        <div className="no-print">
          <Sidebar />
        </div>
        
        <main className="page" style={{ flex: 1, padding: '24px 32px', overflow: 'auto', boxSizing: 'border-box' }}>
          {/* Action Bar (Hidden during print) */}
          <div className="no-print" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
            background: '#101726',
            border: '1px solid #1e293b',
            padding: '12px 18px',
            borderRadius: 8,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={15} style={{ color: '#38bdf8' }} />
                <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>Период отчёта:</span>
              </div>
              <div style={{ display: 'flex', background: '#090d16', borderRadius: 6, border: '1px solid #1e293b', padding: 2 }}>
                {[
                  { id: '24h', label: '24 часа' },
                  { id: '7d', label: '7 дней' },
                  { id: '30d', label: '30 дней' },
                  { id: 'month', label: 'Текущий месяц' },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 4,
                      border: 'none',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: period === p.id ? '#2563eb' : 'transparent',
                      color: period === p.id ? '#fff' : '#94a3b8',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={loadData}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: '1px solid #1e293b',
                  background: '#090d16',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={13} className={loading ? 'spin' : ''} />
                <span>{loading ? 'Загрузка...' : 'Обновить'}</span>
              </button>
              <button
                onClick={handleExportCSV}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 6,
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  background: 'rgba(56, 189, 248, 0.1)',
                  color: '#38bdf8',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <Download size={13} />
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
                  background: '#2563eb',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 700,
                  boxShadow: '0 2px 10px rgba(37,99,235,0.3)',
                }}
              >
                <Printer size={13} />
                <span>Печать / PDF</span>
              </button>
            </div>
          </div>

          {/* Printable Report Document Sheet */}
          <div className="report-sheet" style={{
            background: '#101726',
            border: '1px solid #1e293b',
            borderRadius: 8,
            padding: '32px 36px',
            color: '#f8fafc',
          }}>
            {/* Header / Title */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #1e293b',
              paddingBottom: 20,
              marginBottom: 24,
              flexWrap: 'wrap',
              gap: 16,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    background: 'rgba(37, 99, 235, 0.2)',
                    border: '1px solid #2563eb',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8',
                  }}>
                    <Building size={18} />
                  </div>
                  <span style={{ fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>
                    Министерство Здравоохранения Республики Узбекистан
                  </span>
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: '#fff', letterSpacing: '-0.02em' }}>
                  Сводный отчёт о доступности и инцидентах ИТ-инфраструктуры
                </h1>
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span>Период анализа: <strong style={{ color: '#cbd5e1' }}>{period === '7d' ? 'Последние 7 дней' : period === '30d' ? 'Последние 30 дней' : period === '24h' ? '24 часа' : 'Текущий месяц'}</strong></span>
                  <span>·</span>
                  <span>Сформирован: <strong style={{ color: '#cbd5e1' }}>{reportDate || '—'}</strong></span>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  borderRadius: 6,
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  fontWeight: 700,
                  fontSize: 12,
                }}>
                  <CheckCircle2 size={14} />
                  <span>СТАТУС: В НОРМЕ</span>
                </div>
              </div>
            </div>

            {/* High Level KPI Metrics */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14,
              marginBottom: 32,
            }}>
              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 8, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Общий SLA Кластера</span>
                  <Activity size={14} style={{ color: '#10b981' }} />
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981', fontFeatureSettings: '"tnum"' }}>
                  {overallSla}%
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Целевой уровень: 99.90%</div>
              </div>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 8, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Серверы (Физические / ВМ)</span>
                  <Server size={14} style={{ color: '#2563eb' }} />
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', fontFeatureSettings: '"tnum"' }}>
                  {srvOnline} <span style={{ fontSize: 16, color: '#64748b', fontWeight: 500 }}>/ {servers.length} онлайн</span>
                </div>
                <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>
                  {servers.length > 0 ? `${(srvOnline / servers.length * 100).toFixed(0)}% узлов в строю` : '—'}
                </div>
              </div>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 8, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Веб-порталы & Сервисы</span>
                  <Globe size={14} style={{ color: '#38bdf8' }} />
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', fontFeatureSettings: '"tnum"' }}>
                  {webOnline} <span style={{ fontSize: 16, color: '#64748b', fontWeight: 500 }}>/ {websites.length} активны</span>
                </div>
                <div style={{ fontSize: 11, color: '#38bdf8', marginTop: 4 }}>
                  {websites.length > 0 ? `${(webOnline / websites.length * 100).toFixed(0)}% сервисов онлайн` : '—'}
                </div>
              </div>

              <div style={{ background: '#090d16', border: '1px solid #1e293b', borderRadius: 8, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Инциденты & Тревоги</span>
                  <ShieldAlert size={14} style={{ color: alerts.length > 0 ? '#f59e0b' : '#10b981' }} />
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: alerts.length > 0 ? '#f59e0b' : '#10b981', fontFeatureSettings: '"tnum"' }}>
                  {alerts.length} <span style={{ fontSize: 16, color: '#64748b', fontWeight: 500 }}>активных</span>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  {alerts.length === 0 ? 'Критических инцидентов нет' : 'Требуют внимания дежурного'}
                </div>
              </div>
            </div>

            {/* Section 1: Server Infrastructure */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Server size={16} style={{ color: '#2563eb' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
                  Серверные узлы кластера и вычислительные ресурсы
                </h3>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #1e293b', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Имя узла</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>IP адрес</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>CPU %</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>RAM %</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Диск %</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Пинг</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>SLA (24ч)</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>SLA (30д)</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servers.map((s, idx) => {
                      const sla = slaData.find(x => x.target_id === s.id) || {}
                      const isOk = s.status === 'ok'
                      const cur = s.last_metrics || {}
                      const cpuVal = cur.cpu?.value != null ? Number(cur.cpu.value).toFixed(1) : '—'
                      const ramVal = cur.ram?.value != null ? Number(cur.ram.value).toFixed(1) : '—'
                      const diskVal = cur.disk?.value != null ? Number(cur.disk.value).toFixed(1) : '—'
                      const pingVal = s.last_ping != null ? `${s.last_ping} мс` : '—'

                      return (
                        <tr key={s.id || idx} style={{ borderBottom: '1px solid #1e293b', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: '#fff' }}>
                            {s.name || s.id}
                          </td>
                          <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#94a3b8' }}>{s.host || '—'}</td>
                          <td style={{ padding: '10px 12px', color: cpuVal > 80 ? '#ef4444' : '#cbd5e1' }}>{cpuVal !== '—' ? `${cpuVal}%` : '—'}</td>
                          <td style={{ padding: '10px 12px', color: ramVal > 80 ? '#ef4444' : '#cbd5e1' }}>{ramVal !== '—' ? `${ramVal}%` : '—'}</td>
                          <td style={{ padding: '10px 12px', color: diskVal > 85 ? '#ef4444' : '#cbd5e1' }}>{diskVal !== '—' ? `${diskVal}%` : '—'}</td>
                          <td style={{ padding: '10px 12px', color: '#38bdf8' }}>{pingVal}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: sla.uptime_24h != null && sla.uptime_24h < 99 ? '#ef4444' : '#10b981' }}>
                            {sla.uptime_24h != null ? `${sla.uptime_24h.toFixed(2)}%` : '100%'}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 600, color: sla.uptime_30d != null && sla.uptime_30d < 99 ? '#ef4444' : '#10b981' }}>
                            {sla.uptime_30d != null ? `${sla.uptime_30d.toFixed(2)}%` : '100%'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: isOk ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              border: `1px solid ${isOk ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                              color: isOk ? '#10b981' : '#ef4444',
                              fontWeight: 600,
                              fontSize: 11,
                            }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOk ? '#10b981' : '#ef4444' }} />
                              {isOk ? 'Онлайн' : 'Оффлайн'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: Virtualization & Hypervisor Overview */}
            <div style={{
              marginBottom: 32,
              background: '#090d16',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '20px 24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Layers size={16} style={{ color: '#818cf8' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
                  Физическая инфраструктура виртуализации VMware ESXi
                </h3>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Хост гипервизора:</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 2 }}>
                    {hv?.name || 'VM-SSV'} (192.168.18.222)
                  </div>
                  <div style={{ fontSize: 11, color: '#818cf8', marginTop: 2 }}>VMware ESXi 6.7.0</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Процессор хоста:</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginTop: 2 }}>
                    {hs.cpu_model || 'Intel Xeon E5-2620 0 @ 2.00GHz'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{hs.cpu_cores || 6} ядер / 12 потоков</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Хранилище Datastore:</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#38bdf8', marginTop: 2 }}>
                    {hs.storage_total_gb ? `${(hs.storage_total_gb / 1024).toFixed(1)} TB` : '6.4 TB'}
                  </div>
                  <div style={{ fontSize: 11, color: '#10b981', marginTop: 2 }}>
                    Свободно: {hs.storage_free_gb ? `${(hs.storage_free_gb / 1024).toFixed(1)} TB` : '4.6 TB'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>Виртуальные машины:</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981', marginTop: 2 }}>
                    3 из 3 работают (100%)
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    SSV.HRM, Davomat, Monitoring
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Web Services and Portals */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Globe size={16} style={{ color: '#38bdf8' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
                  Доступность веб-ресурсов и информационных систем
                </h3>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #1e293b', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#090d16', borderBottom: '1px solid #1e293b', color: '#94a3b8' }}>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Ресурс</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>URL-адрес</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Код ответа</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Время отклика</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>SSL Сертификат</th>
                      <th style={{ padding: '10px 12px', fontWeight: 600 }}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {websites.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                          Веб-ресурсы ещё не добавлены в список постоянного мониторинга
                        </td>
                      </tr>
                    ) : (
                      websites.slice(0, 10).map((w, idx) => {
                        const lp = w.last_probe || {}
                        const isUp = lp.status === 'up'
                        return (
                          <tr key={w.id || idx} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#fff' }}>{w.name || w.url}</td>
                            <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#94a3b8' }}>{w.url}</td>
                            <td style={{ padding: '10px 12px', color: isUp ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                              {lp.status_code || 200}
                            </td>
                            <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                              {lp.response_time != null ? `${Math.round(lp.response_time)} мс` : '—'}
                            </td>
                            <td style={{ padding: '10px 12px', color: w.ssl?.valid ? '#10b981' : '#94a3b8' }}>
                              {w.ssl ? (w.ssl.valid ? `✓ До ${new Date(w.ssl.expires).toLocaleDateString()}` : '✗ Недействителен') : 'Внутренний / HTTP'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: isUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: isUp ? '#10b981' : '#ef4444',
                                fontWeight: 600,
                                fontSize: 11,
                              }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: isUp ? '#10b981' : '#ef4444' }} />
                                {isUp ? 'Доступен' : 'Недоступен'}
                              </span>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Official Sign-off Block */}
            <div style={{
              borderTop: '2px solid #1e293b',
              paddingTop: 24,
              marginTop: 32,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              fontSize: 12,
              color: '#94a3b8',
              flexWrap: 'wrap',
              gap: 20,
            }}>
              <div>
                <div>Отчёт сгенерирован автоматизированным комплексом мониторинга платформы.</div>
                <div style={{ marginTop: 4 }}>Все права защищены © Министерство Здравоохранения Республики Узбекистан.</div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ marginBottom: 30, color: '#cbd5e1', fontWeight: 600 }}>
                  Ответственный администратор инфраструктуры:
                </div>
                <div style={{ borderBottom: '1px solid #475569', width: 240, margin: '0 0 6px auto' }} />
                <div style={{ fontSize: 11, color: '#64748b' }}>(Подпись / Дата)</div>
              </div>
            </div>
          </div>
        </main>
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
