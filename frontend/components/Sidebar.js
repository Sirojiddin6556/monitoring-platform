import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'

const NAV = [
  {
    id: 'home',
    icon: '⬡',
    label: 'Главная',
    href: '/',
  },
  {
    id: 'resources',
    icon: '▣',
    label: 'Ресурсы',
    items: [
      { label: 'Серверы',               href: '/servers' },
      { label: 'Веб-сайты',             href: '/websites' },
      { label: 'API',                   href: '/api-monitoring', adminOnly: true },
      {
        id: 'containers',
        label: 'Контейнеры',
        adminOnly: true,
        items: [
          { label: 'Docker',            href: '/docker' },
          { label: 'Kubernetes',        href: '/kubernetes' },
        ],
      },
      { label: 'Виртуальные машины',    href: '/vms', adminOnly: true },
      { label: 'Базы данных',           href: '/databases' },
      { label: 'Сетевое оборудование',  href: '/network-equipment' },
      { label: 'SSL-сертификаты',       href: '/ssl' },
    ],
  },
  {
    id: 'events',
    icon: '◈',
    label: 'События',
    items: [
      { label: 'Алерты',     href: '/alerts' },
      { label: 'Инциденты',  href: '/incidents' },
      { label: 'Логи',       href: '/logs', adminOnly: true },
    ],
  },
  {
    id: 'analytics',
    icon: '◫',
    label: 'Аналитика',
    items: [
      { label: 'Дашборды', href: '/dashboards' },
      { label: 'Отчёты',   soon: true },
    ],
  },
  {
    id: 'notifications',
    icon: '◎',
    label: 'Уведомления',
    adminOnly: true,
    items: [
      { label: 'Telegram',        href: '/telegram' },
      { label: 'Email & Webhook', href: '/notifications' },
      { label: 'SMS',             soon: true },
    ],
  },
  {
    id: 'system',
    icon: '◌',
    label: 'Система',
    items: [
      { label: 'Обслуживание', href: '/maintenance' },
      { label: 'Настройки',    href: '/settings', adminOnly: true },
    ],
  },
  {
    id: 'admin',
    icon: '◉',
    label: 'Администрирование',
    adminOnly: true,
    items: [
      { label: 'Организации',  href: '/organizations' },
      { label: 'Пользователи', href: '/admin' },
    ],
  },
]

function collectHrefs(items) {
  const out = []
  for (const item of items) {
    if (item.href) out.push(item.href)
    if (item.items) out.push(...collectHrefs(item.items))
  }
  return out
}

function anyChildActive(items, pathname) {
  for (const href of collectHrefs(items)) {
    if (href === pathname || (href !== '/' && pathname.startsWith(href + '/'))) return true
  }
  return false
}

function NavLeaf({ label, href, depth, pathname }) {
  const [hover, setHover] = useState(false)
  const active = href === pathname || (href !== '/' && pathname.startsWith(href + '/'))
  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: `5px 10px 5px ${12 + depth * 14}px`,
        color: active ? '#a5b4fc' : hover ? '#c4cfe0' : '#6272a4',
        background: active ? 'rgba(99,102,241,0.12)' : hover ? 'rgba(255,255,255,0.04)' : 'none',
        borderLeft: `2px solid ${active ? '#6366f1' : 'transparent'}`,
        fontSize: 12.5,
        textDecoration: 'none',
        borderRadius: '0 6px 6px 0',
        transition: 'color 0.12s, background 0.12s',
        lineHeight: 1.5,
      }}
    >
      {label}
    </Link>
  )
}

function NavSoon({ label, depth }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: `5px 10px 5px ${12 + depth * 14}px`,
      color: '#2e3558',
      fontSize: 12.5,
      lineHeight: 1.5,
      userSelect: 'none',
    }}>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{
        fontSize: 9,
        color: '#3a4070',
        background: '#0d0d24',
        border: '1px solid #1c1c3e',
        padding: '1px 5px',
        borderRadius: 3,
        letterSpacing: 0.3,
      }}>Скоро</span>
    </div>
  )
}

function NavSubGroup({ item, depth, pathname, open, toggle }) {
  const active = anyChildActive(item.items, pathname)
  const isOpen = open[item.id] !== undefined ? open[item.id] : active
  const [hover, setHover] = useState(false)

  return (
    <div>
      <button
        onClick={() => toggle(item.id)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: `5px 10px 5px ${12 + depth * 14}px`,
          background: hover ? 'rgba(255,255,255,0.04)' : 'none',
          border: 'none',
          borderLeft: '2px solid transparent',
          cursor: 'pointer',
          color: active ? '#a5b4fc' : hover ? '#8892a8' : '#4a5078',
          fontSize: 12.5,
          textAlign: 'left',
          borderRadius: '0 6px 6px 0',
          lineHeight: 1.5,
          fontFamily: 'inherit',
        }}
      >
        <span style={{ flex: 1 }}>{item.label}</span>
        <span style={{
          fontSize: 8,
          color: '#3a4070',
          transition: 'transform 0.18s',
          transform: isOpen ? 'rotate(90deg)' : 'none',
          display: 'inline-block',
        }}>▶</span>
      </button>
      {isOpen && item.items.map(sub =>
        sub.soon
          ? <NavSoon key={sub.label} label={sub.label} depth={depth + 1} />
          : <NavLeaf key={sub.href} label={sub.label} href={sub.href} depth={depth + 1} pathname={pathname} />
      )}
    </div>
  )
}

export default function Sidebar() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [open, setOpen] = useState({})
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (stored) setUser(JSON.parse(stored))
  }, [])

  // Close the mobile off-canvas drawer whenever the route changes.
  useEffect(() => {
    const close = () => setMobileOpen(false)
    router.events.on('routeChangeStart', close)
    return () => router.events.off('routeChangeStart', close)
  }, [router.events])

  useEffect(() => {
    const autoOpen = {}
    for (const section of NAV) {
      if (section.items) {
        if (anyChildActive(section.items, router.pathname)) autoOpen[section.id] = true
        for (const item of section.items) {
          if (item.items && anyChildActive(item.items, router.pathname)) {
            autoOpen[item.id] = true
            autoOpen[section.id] = true
          }
        }
      }
    }
    setOpen(prev => ({ ...prev, ...autoOpen }))
  }, [router.pathname])

  const toggle = (id) => setOpen(prev => ({ ...prev, [id]: !prev[id] }))

  const isAdmin = user?.role === 'admin'
  const pathname = router.pathname

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/auth/login')
  }

  function renderSection(section) {
    if (section.adminOnly && !isAdmin) return null

    if (section.href) {
      const active = section.href === pathname || (section.href !== '/' && pathname.startsWith(section.href + '/'))
      return <TopLink key={section.id} href={section.href} icon={section.icon} label={section.label} active={active} />
    }

    const groupActive = anyChildActive(section.items, pathname)
    const isOpen = open[section.id] !== undefined ? open[section.id] : groupActive

    return (
      <div key={section.id} style={{ marginBottom: 1 }}>
        <SectionHeader
          icon={section.icon}
          label={section.label}
          isOpen={isOpen}
          active={groupActive}
          onClick={() => toggle(section.id)}
        />
        {isOpen && (
          <div style={{ paddingBottom: 2 }}>
            {section.items.map(item => {
              if (item.adminOnly && !isAdmin) return null
              if (item.items) {
                return (
                  <NavSubGroup
                    key={item.id}
                    item={item}
                    depth={0}
                    pathname={pathname}
                    open={open}
                    toggle={toggle}
                  />
                )
              }
              if (item.soon) return <NavSoon key={item.label} label={item.label} depth={0} />
              return <NavLeaf key={item.href} label={item.label} href={item.href} depth={0} pathname={pathname} />
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        className="sidebar-toggle"
        onClick={() => setMobileOpen(v => !v)}
        aria-label={mobileOpen ? 'Закрыть меню' : 'Открыть меню'}
      >
        {mobileOpen ? '✕' : '☰'}
      </button>
      <div
        className={`sidebar-backdrop${mobileOpen ? ' open' : ''}`}
        onClick={() => setMobileOpen(false)}
      />
      <div className={`sidebar-root${mobileOpen ? ' open' : ''}`} style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: 220,
        flexShrink: 0,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #0a0a1e 0%, #070712 100%)',
        borderRight: '1px solid #1c1c3e',
      }}>
      {/* Logo */}
      <div style={{
        padding: '15px 14px 13px',
        borderBottom: '1px solid #121228',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 26, height: 26,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            borderRadius: 7,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, flexShrink: 0,
            boxShadow: '0 0 12px rgba(99,102,241,0.4)',
          }}>⬡</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e4f0', letterSpacing: 0.1 }}>Monitoring</span>
        </div>
      </div>

      {/* Nav */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '8px 5px 10px 3px',
        scrollbarWidth: 'thin',
        scrollbarColor: '#1c1c3e transparent',
      }}>
        {NAV.map(section => renderSection(section))}
      </div>

      {/* User / Logout */}
      <div style={{
        padding: '10px 12px 14px',
        borderTop: '1px solid #121228',
        flexShrink: 0,
      }}>
        {user ? (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
            }}>
              <div style={{
                width: 28, height: 28,
                background: 'linear-gradient(135deg, #6366f1, #a78bfa)',
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {(user.username || 'U')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#c4cfe0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.username}
                </div>
                <div style={{
                  fontSize: 10.5,
                  color: user.role === 'admin' ? '#f59e0b' : '#818cf8',
                  marginTop: 1,
                }}>
                  {user.role === 'admin' ? 'Администратор' : user.role === 'user' ? 'Пользователь' : 'Просмотр'}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: 'rgba(244,63,94,0.1)',
                color: '#f87171',
                border: '1px solid rgba(244,63,94,0.2)',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.15s',
              }}
            >
              Выйти
            </button>
          </>
        ) : (
          <Link href="/auth/login" style={{
            display: 'block',
            padding: '7px 12px',
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            color: '#fff',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            textAlign: 'center',
            textDecoration: 'none',
          }}>
            Войти
          </Link>
        )}
      </div>
      </div>
    </>
  )
}

function TopLink({ href, icon, label, active }) {
  const [hover, setHover] = useState(false)
  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        color: active ? '#a5b4fc' : hover ? '#c4cfe0' : '#8892a8',
        background: active ? 'rgba(99,102,241,0.12)' : hover ? 'rgba(255,255,255,0.04)' : 'none',
        borderLeft: `2px solid ${active ? '#6366f1' : 'transparent'}`,
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        borderRadius: '0 7px 7px 0',
        transition: 'color 0.12s, background 0.12s',
        marginBottom: 1,
      }}
    >
      <span style={{ fontSize: 13, opacity: 0.8 }}>{icon}</span>
      <span>{label}</span>
    </Link>
  )
}

function SectionHeader({ icon, label, isOpen, active, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '6px 10px',
        background: hover ? 'rgba(255,255,255,0.04)' : 'none',
        border: 'none',
        borderLeft: '2px solid transparent',
        cursor: 'pointer',
        color: active ? '#a5b4fc' : hover ? '#8892a8' : '#505878',
        fontSize: 12,
        fontWeight: 700,
        textAlign: 'left',
        borderRadius: '0 7px 7px 0',
        marginBottom: 1,
        fontFamily: 'inherit',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      <span style={{ fontSize: 11, opacity: 0.7 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{
        fontSize: 8,
        color: '#3a4070',
        transition: 'transform 0.18s',
        transform: isOpen ? 'rotate(90deg)' : 'none',
        display: 'inline-block',
      }}>▶</span>
    </button>
  )
}
