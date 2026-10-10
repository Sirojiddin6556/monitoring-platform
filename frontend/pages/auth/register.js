import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import apiFetch from '../../lib/api'
import { Activity, Lock, Mail, User } from 'lucide-react'

export default function Register() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password !== confirmPassword) {
      setError('Введенные пароли не совпадают')
      return
    }
    if (password.length < 8) {
      setError('Пароль должен содержать не менее 8 символов')
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      })
      if (res.id) {
        setSuccess(true)
        setTimeout(() => router.push('/auth/login'), 1800)
      } else {
        setError(res.detail || 'Ошибка создания учетной записи')
      }
    } catch (err) {
      setError('Ошибка сети: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#090d16',
        padding: 20,
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '36px 32px',
          background: '#101726',
          borderRadius: 12,
          border: '1px solid #1e293b',
          boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              background: '#2563eb18',
              border: '1px solid #2563eb40',
              borderRadius: 10,
              color: '#38bdf8',
              marginBottom: 14,
            }}
          >
            <Activity size={22} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em' }}>
            Создание аккаунта
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Регистрация оператора в платформе мониторинга
          </div>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: 18,
              background: '#ef444415',
              color: '#f87171',
              border: '1px solid #ef444435',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              padding: '10px 14px',
              marginBottom: 18,
              background: '#10b98115',
              color: '#34d399',
              border: '1px solid #10b98135',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            Учетная запись создана! Перенаправляем на вход...
          </div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={14} style={iconStyle} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="operator@company.com"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Имя пользователя</label>
              <div style={{ position: 'relative' }}>
                <User size={14} style={iconStyle} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  placeholder="operator1"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Пароль</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={iconStyle} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Минимум 8 символов"
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Подтверждение пароля</label>
              <div style={{ position: 'relative' }}>
                <Lock size={14} style={iconStyle} />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  placeholder="Повторите пароль"
                  style={inputStyle}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 6,
                padding: '10px 16px',
                background: loading ? '#1e293b' : '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              {loading ? 'Создание...' : 'Зарегистрироваться'}
            </button>
          </form>
        )}

        <div style={{ marginTop: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
          Уже зарегистрированы?{' '}
          <Link href="/auth/login" style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: 600 }}>
            Войти в систему
          </Link>
        </div>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  marginBottom: 5,
  color: '#94a3b8',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const iconStyle = {
  position: 'absolute',
  left: 12,
  top: 12,
  color: '#64748b',
}

const inputStyle = {
  width: '100%',
  padding: '9px 12px 9px 34px',
  border: '1px solid #1e293b',
  borderRadius: 6,
  background: '#090d16',
  color: '#f8fafc',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
}
