export default function apiFetch(path, opts = {}){
  const base = process.env.NEXT_PUBLIC_API_URL || ''
  const url = base + path
  
  // Получить токен из localStorage
  let token = null
  if(typeof window !== 'undefined'){
    token = localStorage.getItem('token')
  }
  
  // Подготовить заголовки
  const headers = opts.headers || {}
  if(token){
    headers.Authorization = `Bearer ${token}`
  }
  
  // По умолчанию JSON
  if(opts.body && !headers['Content-Type']){
    headers['Content-Type'] = 'application/json'
  }
  
  return fetch(url, {...opts, headers}).then(async r => {
    const data = await r.json()
    if(!r.ok && r.status === 401){
      // Токен истек, очистить локалсторедж и перенаправить на вход
      if(typeof window !== 'undefined'){
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.href = '/auth/login'
      }
    }
    return data
  })
}

