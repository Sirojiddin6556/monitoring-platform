export default function apiFetch(path, opts = {}) {
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
  const url = base + path

  let token = null
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('token')
  }

  const headers = opts.headers || {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (opts.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  return fetch(url, { ...opts, headers }).then(async r => {
    let data
    try {
      data = await r.json()
    } catch (e) {
      data = { detail: `Ошибка сервера (${r.status})` }
    }
    if (!r.ok) {
      if (r.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          if (!window.location.pathname.startsWith('/auth/login')) {
            window.location.href = '/auth/login'
          }
        }
      }
      const detail = Array.isArray(data.detail)
        ? data.detail.map(e => e.msg || String(e)).join('; ')
        : data.detail
      throw new Error(detail || `Ошибка ${r.status}`)
    }
    return data
  })
}

// SLA
export const slaApi = {
  summary: (orgId) => apiFetch(`/api/sla/summary${orgId ? `?org_id=${orgId}` : ''}`),
  forTarget: (type, id, days = 30) => apiFetch(`/api/sla/${type}/${id}?days=${days}`),
  report: (from, to, orgId) => apiFetch(`/api/sla/report?from_date=${from}&to_date=${to}${orgId ? `&org_id=${orgId}` : ''}`),
}

// Incidents
export const incidentsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.severity) q.set('severity', params.severity)
    if (params.limit) q.set('limit', params.limit)
    return apiFetch(`/api/incidents${q.toString() ? '?' + q : ''}`)
  },
  get: (id) => apiFetch(`/api/incidents/${id}`),
  create: (data) => apiFetch('/api/incidents', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/api/incidents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  acknowledge: (id) => apiFetch(`/api/incidents/${id}/acknowledge`, { method: 'POST' }),
  resolve: (id, note) => apiFetch(`/api/incidents/${id}/resolve${note ? `?note=${encodeURIComponent(note)}` : ''}`, { method: 'POST' }),
  close: (id) => apiFetch(`/api/incidents/${id}/close`, { method: 'POST' }),
  listComments: (id) => apiFetch(`/api/incidents/${id}/comments`),
  addComment: (id, content) => apiFetch(`/api/incidents/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
}

// Maintenance windows
export const maintenanceApi = {
  list: (includePast = false) => apiFetch(`/api/maintenance?include_past=${includePast}`),
  active: () => apiFetch('/api/maintenance/active'),
  get: (id) => apiFetch(`/api/maintenance/${id}`),
  create: (data) => apiFetch('/api/maintenance', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/api/maintenance/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  cancel: (id) => apiFetch(`/api/maintenance/${id}`, { method: 'DELETE' }),
}

// Server alert configs
export const serverConfigApi = {
  get: (serverId) => apiFetch(`/api/servers/${serverId}/alert-config`),
  update: (serverId, data) => apiFetch(`/api/servers/${serverId}/alert-config`, { method: 'PUT', body: JSON.stringify(data) }),
  reset: (serverId) => apiFetch(`/api/servers/${serverId}/alert-config`, { method: 'DELETE' }),
}

// Dashboards
export const dashboardsApi = {
  list: () => apiFetch('/api/dashboards'),
  get: (id) => apiFetch(`/api/dashboards/${id}`),
  create: (data) => apiFetch('/api/dashboards', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => apiFetch(`/api/dashboards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => apiFetch(`/api/dashboards/${id}`, { method: 'DELETE' }),
  addWidget: (dashId, data) => apiFetch(`/api/dashboards/${dashId}/widgets`, { method: 'POST', body: JSON.stringify(data) }),
  updateWidget: (dashId, widgetId, data) => apiFetch(`/api/dashboards/${dashId}/widgets/${widgetId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWidget: (dashId, widgetId) => apiFetch(`/api/dashboards/${dashId}/widgets/${widgetId}`, { method: 'DELETE' }),
}
