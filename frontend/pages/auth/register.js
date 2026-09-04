import {useState} from 'react'
import {useRouter} from 'next/router'
import Link from 'next/link'
import apiFetch from '../../lib/api'

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
    if(password !== confirmPassword){ setError('Пароли не совпадают'); return }
    if(password.length < 8){ setError('Пароль должен быть не менее 8 символов'); return }
    setLoading(true)
    try {
      const res = await apiFetch('/api/auth/register', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({email, username, password})
      })
      if(res.id){
        setSuccess(true)
        setTimeout(() => router.push('/auth/login'), 2000)
      } else {
        setError(res.detail || 'Ошибка регистрации')
      }
    } catch(err){
      setError('Ошибка сети: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = {
    width:'100%', padding:'10px 12px',
    border:'1px solid #1c1c3e', borderRadius:8,
    background:'#0b0b1e', color:'#e2e4f0',
    fontSize:14, outline:'none', fontFamily:'inherit',
    transition:'border-color 0.18s',
  }
  const onFocus = e => { e.target.style.borderColor='rgba(99,102,241,0.5)'; e.target.style.boxShadow='0 0 0 3px rgba(99,102,241,0.1)' }
  const onBlur  = e => { e.target.style.borderColor='#1c1c3e'; e.target.style.boxShadow='none' }

  return (
    <div style={{
      display:'flex', justifyContent:'center', alignItems:'center',
      minHeight:'100vh',
      background:'radial-gradient(ellipse 120% 80% at 60% -10%, #1a0a3a 0%, #07071a 55%, #030310 100%)',
    }}>
      <div style={{
        width:'100%', maxWidth:380,
        padding:36,
        background:'linear-gradient(135deg, rgba(13,13,36,0.98) 0%, rgba(11,11,30,0.96) 100%)',
        borderRadius:16,
        border:'1px solid rgba(130,130,220,0.12)',
        boxShadow:'0 24px 64px rgba(0,0,0,0.6), 0 0 80px rgba(99,102,241,0.05)',
      }}>
        {/* Logo */}
        <div style={{textAlign:'center', marginBottom:28}}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:44, height:44,
            background:'linear-gradient(135deg, #6366f1, #4f46e5)',
            borderRadius:12, fontSize:20, marginBottom:12,
            boxShadow:'0 0 20px rgba(99,102,241,0.4)',
          }}>⬡</div>
          <div style={{fontSize:20, fontWeight:700, color:'#e2e4f0', letterSpacing:-0.3}}>Monitoring</div>
          <div style={{fontSize:12, color:'#6272a4', marginTop:4}}>Создайте аккаунт</div>
        </div>

        {error && (
          <div style={{
            padding:'10px 14px', marginBottom:14,
            background:'rgba(244,63,94,0.1)', color:'#f87171',
            border:'1px solid rgba(244,63,94,0.25)',
            borderRadius:8, fontSize:13,
          }}>{error}</div>
        )}

        {success && (
          <div style={{
            padding:'10px 14px', marginBottom:14,
            background:'rgba(34,197,94,0.1)', color:'#4ade80',
            border:'1px solid rgba(34,197,94,0.25)',
            borderRadius:8, fontSize:13,
          }}>Регистрация успешна! Перенаправляем...</div>
        )}

        {!success && (
          <form onSubmit={handleSubmit} style={{display:'flex', flexDirection:'column', gap:14}}>
            {[
              {label:'Email', type:'email', val:email, set:setEmail, ph:'you@example.com'},
              {label:'Имя пользователя', type:'text', val:username, set:setUsername, ph:'username', min:3},
              {label:'Пароль', type:'password', val:password, set:setPassword, ph:'••••••••', min:8},
              {label:'Подтвердить пароль', type:'password', val:confirmPassword, set:setConfirmPassword, ph:'••••••••'},
            ].map(f => (
              <div key={f.label}>
                <label style={{display:'block', marginBottom:5, color:'#8892a8', fontSize:12, fontWeight:600, textTransform:'uppercase', letterSpacing:0.4}}>
                  {f.label}
                </label>
                <input
                  type={f.type} value={f.val} required
                  minLength={f.min}
                  placeholder={f.ph}
                  onChange={e => f.set(e.target.value)}
                  style={inputStyle}
                  onFocus={onFocus} onBlur={onBlur}
                />
              </div>
            ))}

            <button
              type="submit" disabled={loading}
              style={{
                marginTop:4,
                padding:'11px 16px',
                background: loading ? '#2a2a50' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                color:'#fff', border:'none', borderRadius:8,
                fontSize:14, fontWeight:600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.65 : 1,
                fontFamily:'inherit',
                boxShadow: loading ? 'none' : '0 0 16px rgba(99,102,241,0.3)',
                transition:'all 0.18s',
              }}
            >
              {loading ? 'Загрузка...' : 'Зарегистрироваться'}
            </button>
          </form>
        )}

        <div style={{marginTop:20, textAlign:'center', color:'#6272a4', fontSize:13}}>
          Уже есть аккаунт?{' '}
          <Link href="/auth/login" style={{color:'#818cf8', textDecoration:'none', fontWeight:600}}>
            Войдите
          </Link>
        </div>
      </div>
    </div>
  )
}
