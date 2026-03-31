import {useState} from 'react'
import {useRouter} from 'next/router'
import Link from 'next/link'

export default function Register(){
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
    
    if(password !== confirmPassword){
      setError('Пароли не совпадают')
      return
    }
    
    if(password.length < 6){
      setError('Пароль должен быть не менее 6 символов')
      return
    }
    
    setLoading(true)
    
    try {
      const {default: apiFetch} = await import('../../lib/api')
      const res = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email, username, password})
      })
      
      if(res.id){
        setSuccess(true)
        setTimeout(() => {
          router.push('/auth/login')
        }, 2000)
      } else {
        setError(res.detail || 'Ошибка регистрации')
      }
    } catch(err){
      setError('Ошибка сети: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#07111e'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 400,
        padding: 32,
        background: '#0a1a2e',
        borderRadius: 8,
        border: '1px solid #1a2940'
      }}>
        <h1 style={{fontSize: 24, marginBottom: 24, color: '#fff', textAlign: 'center'}}>
          Регистрация
        </h1>
        
        {error && (
          <div style={{
            padding: 12,
            marginBottom: 16,
            background: '#ef4444',
            color: '#fff',
            borderRadius: 4,
            fontSize: 14
          }}>
            {error}
          </div>
        )}
        
        {success && (
          <div style={{
            padding: 12,
            marginBottom: 16,
            background: '#4ade80',
            color: '#000',
            borderRadius: 4,
            fontSize: 14
          }}>
            Регистрация успешна! Перенаправляем на вход...
          </div>
        )}
        
        {!success && (
          <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: 16}}>
            <div>
              <label style={{display: 'block', marginBottom: 6, color: '#fff', fontSize: 13}}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #1a2940',
                  borderRadius: 4,
                  background: '#07111e',
                  color: '#fff',
                  fontSize: 14,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div>
              <label style={{display: 'block', marginBottom: 6, color: '#fff', fontSize: 13}}>
                Имя пользователя
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #1a2940',
                  borderRadius: 4,
                  background: '#07111e',
                  color: '#fff',
                  fontSize: 14,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div>
              <label style={{display: 'block', marginBottom: 6, color: '#fff', fontSize: 13}}>
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #1a2940',
                  borderRadius: 4,
                  background: '#07111e',
                  color: '#fff',
                  fontSize: 14,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <div>
              <label style={{display: 'block', marginBottom: 6, color: '#fff', fontSize: 13}}>
                Подтвердить пароль
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #1a2940',
                  borderRadius: 4,
                  background: '#07111e',
                  color: '#fff',
                  fontSize: 14,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '12px 16px',
                background: loading ? '#64748b' : '#00d4ff',
                color: '#000',
                border: 'none',
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? 'Загрузка...' : 'Зарегистрироваться'}
            </button>
          </form>
        )}
        
        <div style={{marginTop: 20, textAlign: 'center', color: '#9aa4b2', fontSize: 14}}>
          Уже есть аккаунт?{' '}
          <Link href="/auth/login" style={{color: '#00d4ff', textDecoration: 'none'}}>
            Войдите
          </Link>
        </div>
      </div>
    </div>
  )
}
