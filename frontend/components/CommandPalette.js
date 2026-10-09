import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'

const DEFAULT_ITEMS = [
  // Primary Navigation
  { id: 'p-exec', title: 'Ситуационный Центр (Executive View)', category: 'Раздел', icon: '📊', href: '/executive' },
  { id: 'p-noc', title: 'NOC / TV Kiosk Режим (Для мониторов)', category: 'Раздел', icon: '📺', href: '/noc' },
  { id: 'p-reports', title: 'Сводные отчёты и SLA', category: 'Раздел', icon: '📑', href: '/reports' },
  { id: 'p-servers', title: 'Серверы и инфраструктура', category: 'Раздел', icon: '🖥️', href: '/servers' },
  { id: 'p-vms', title: 'Виртуальные машины (VMware ESXi)', category: 'Раздел', icon: '🖲️', href: '/vms' },
  { id: 'p-databases', title: 'Базы данных (PostgreSQL, Redis)', category: 'Раздел', icon: '🗄️', href: '/databases' },
  { id: 'p-docker', title: 'Контейнеры Docker', category: 'Раздел', icon: '🐳', href: '/docker' },
  { id: 'p-alerts', title: 'Активные алерты и предупреждения', category: 'Раздел', icon: '🔔', href: '/alerts' },
  { id: 'p-incidents', title: 'Инциденты и журнал сбоев', category: 'Раздел', icon: '⚠️', href: '/incidents' },
  { id: 'p-websites', title: 'Мониторинг сайтов (Websites)', category: 'Раздел', icon: '🌐', href: '/websites' },
  { id: 'p-ssl', title: 'SSL / TLS сертификаты', category: 'Раздел', icon: '🔒', href: '/ssl' },
  { id: 'p-logs', title: 'Системные логи', category: 'Раздел', icon: '📜', href: '/logs' },
  { id: 'p-telegram', title: 'Telegram бот и каналы', category: 'Раздел', icon: '✈️', href: '/telegram' },
  { id: 'p-settings', title: 'Настройки платформы', category: 'Раздел', icon: '⚙️', href: '/settings' },

  // Dedicated Servers
  { id: 's-hrm', title: 'SSV.HRM (192.168.17.49)', subtitle: 'Кадровый сервер • VM-SSV.HRM', category: 'Сервер', icon: '🟢', href: '/servers' },
  { id: 's-klaster', title: 'klaster (192.168.17.51)', subtitle: 'Кластер посещаемости • VM-SSV.Davomaat.Hisobot', category: 'Сервер', icon: '🟢', href: '/servers' },
  { id: 's-mon', title: 'Monitoring-platform (192.168.17.50)', subtitle: 'Хост платформы мониторинга', category: 'Сервер', icon: '🟢', href: '/servers' },

  // VMware Infrastructure
  { id: 'vm-esxi', title: 'Гипервизор VMware ESXi (192.168.17.47)', subtitle: 'Хост VM-SSV • ESXi 8.0', category: 'Гипервизор', icon: '🧱', href: '/vms' },
  { id: 'vm-hrm', title: 'VM-SSV.HRM', subtitle: '4 vCPU • 8 GB RAM • 192.168.17.49', category: 'ВМ', icon: '📦', href: '/vms' },
  { id: 'vm-dav', title: 'VM-SSV.Davomaat.Hisobot', subtitle: '6 vCPU • 12 GB RAM • 192.168.17.51', category: 'ВМ', icon: '📦', href: '/vms' },
  { id: 'vm-mon', title: 'OS-monitoring-platform', subtitle: '8 vCPU • 16 GB RAM • 192.168.17.50', category: 'ВМ', icon: '📦', href: '/vms' },

  // Databases
  { id: 'db-dav', title: 'davomat_db (PostgreSQL)', subtitle: 'База данных учета рабочего времени • 192.168.17.51', category: 'База данных', icon: '🗄️', href: '/databases' },
  { id: 'db-mon', title: 'monitoring (PostgreSQL)', subtitle: 'База данных метрик мониторинга • 192.168.17.50', category: 'База данных', icon: '🗄️', href: '/databases' },
]

export default function CommandPalette({ isOpen, onClose }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Filter items
  const filtered = query.trim() === ''
    ? DEFAULT_ITEMS
    : DEFAULT_ITEMS.filter(item => {
        const text = `${item.title} ${item.subtitle || ''} ${item.category}`.toLowerCase()
        return text.includes(query.toLowerCase())
      })

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex]
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  const handleSelect = (item) => {
    if (!item) return
    onClose()
    if (item.href) {
      router.push(item.href)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex])
      }
    }
  }

  if (!isOpen) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(7, 7, 26, 0.75)',
        backdropFilter: 'blur(6px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '92%',
          maxWidth: 620,
          background: '#0d0d26',
          border: '1px solid #2d2f5a',
          borderRadius: 14,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(99, 102, 241, 0.2)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Search Input Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid #1c1c42',
          background: '#101032',
        }}>
          <span style={{ fontSize: 18, opacity: 0.8 }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Поиск серверов, ВМ, баз данных, метрик... (↑↓ Навигация, Enter)"
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: '#f1f5f9',
              fontSize: 15,
              fontFamily: 'inherit',
            }}
          />
          <span style={{
            fontSize: 10,
            background: 'rgba(255, 255, 255, 0.08)',
            color: '#94a3b8',
            padding: '3px 7px',
            borderRadius: 5,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            fontWeight: 600,
          }}>ESC</span>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          style={{
            maxHeight: 380,
            overflowY: 'auto',
            padding: '8px',
            scrollbarWidth: 'thin',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
              Ничего не найдено по запросу «{query}»
            </div>
          ) : (
            filtered.map((item, idx) => {
              const active = idx === selectedIndex
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: active ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                    borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
                    transition: 'all 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <span style={{ fontSize: 16 }}>{item.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: active ? '#ffffff' : '#e2e8f0',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div style={{
                          fontSize: 11.5,
                          color: active ? '#cbd5e1' : '#64748b',
                          marginTop: 2,
                        }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: item.category === 'Сервер'
                      ? 'rgba(34, 197, 94, 0.15)'
                      : item.category === 'ВМ'
                      ? 'rgba(56, 189, 248, 0.15)'
                      : item.category === 'База данных'
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'rgba(99, 102, 241, 0.15)',
                    color: item.category === 'Сервер'
                      ? '#4ade80'
                      : item.category === 'ВМ'
                      ? '#38bdf8'
                      : item.category === 'База данных'
                      ? '#fbbf24'
                      : '#a5b4fc',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                  }}>
                    {item.category}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: '#09091c',
          borderTop: '1px solid #1c1c38',
          fontSize: 11,
          color: '#64748b',
        }}>
          <div>
            Нажмите <kbd style={{ background: '#1c1c3e', padding: '1px 5px', borderRadius: 4, color: '#94a3b8' }}>↑</kbd> <kbd style={{ background: '#1c1c3e', padding: '1px 5px', borderRadius: 4, color: '#94a3b8' }}>↓</kbd> для навигации, <kbd style={{ background: '#1c1c3e', padding: '1px 5px', borderRadius: 4, color: '#94a3b8' }}>↵</kbd> выбор
          </div>
          <div>
            Быстрый переход
          </div>
        </div>
      </div>
    </div>
  )
}
