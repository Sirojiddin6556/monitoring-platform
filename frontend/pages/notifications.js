import {useEffect, useState, useCallback} from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'

const CHANNEL_TYPES = [
  {value: 'telegram', label: 'Telegram', icon: '📱', color: '#229ED9'},
  {value: 'email', label: 'Email (SMTP)', icon: '📧', color: '#ea4335'},
  {value: 'webhook', label: 'Webhook', icon: '🔗', color: '#7c3aed'},
  {value: 'discord', label: 'Discord', icon: '💬', color: '#5865F2'},
]

const SEVERITIES = [
  {value: 'all', label: 'Все'},
  {value: 'critical', label: 'Critical'},
  {value: 'warning', label: 'Warning'},
  {value: 'info', label: 'Info'},
]

const CATEGORIES = [
  {value: 'all', label: 'Все'},
  {value: 'system', label: 'Система'},
  {value: 'website', label: 'Веб-сайты'},
  {value: 'service', label: 'Сервисы'},
  {value: 'docker', label: 'Docker'},
  {value: 'security', label: 'Безопасность'},
]

const ALL_CATEGORIES = [
  {value: 'system', label: 'Система'},
  {value: 'website', label: 'Веб-сайты'},
  {value: 'service', label: 'Сервисы'},
  {value: 'docker', label: 'Docker'},
  {value: 'security', label: 'Безопасность'},
]

const TARGET_TYPES = [
  {value: '', label: 'Все ресурсы', icon: '🌐'},
  {value: 'server', label: 'Серверы', icon: '🖥️'},
  {value: 'website', label: 'Веб-сайты', icon: '🌍'},
  {value: 'hypervisor', label: 'Виртуальные машины', icon: '💻'},
]

const METRICS = [
  {value: 'any', label: 'Любая метрика', icon: '📊', group: 'general', unit: ''},
  {value: 'cpu', label: 'CPU (процессор)', icon: '⚡', group: 'server', unit: '%'},
  {value: 'ram', label: 'RAM (память)', icon: '🧠', group: 'server', unit: '%'},
  {value: 'disk', label: 'Диск', icon: '💾', group: 'server', unit: '%'},
  {value: 'swap', label: 'Swap', icon: '🔄', group: 'server', unit: '%'},
  {value: 'ping', label: 'Ping (задержка)', icon: '📡', group: 'server', unit: 'мс'},
  {value: 'availability', label: 'Доступность', icon: '🟢', group: 'server', unit: ''},
  {value: 'response_time', label: 'Время ответа', icon: '⏱️', group: 'website', unit: 'мс'},
  {value: 'ssl_expiry', label: 'SSL-сертификат', icon: '🔒', group: 'website', unit: 'дней'},
  {value: 'status_code', label: 'HTTP статус', icon: '🔢', group: 'website', unit: ''},
  {value: 'zombie_processes', label: 'Zombie-процессы', icon: '🧟', group: 'server', unit: ''},
  {value: 'service_status', label: 'Статус сервиса', icon: '⚙️', group: 'server', unit: ''},
  {value: 'container_status', label: 'Статус контейнера', icon: '🐳', group: 'server', unit: ''},
]

const CONDITIONS = [
  {value: 'gt', label: 'Больше чем (>)', short: '>'},
  {value: 'lt', label: 'Меньше чем (<)', short: '<'},
  {value: 'eq', label: 'Равно (=)', short: '='},
  {value: 'neq', label: 'Не равно (≠)', short: '≠'},
]

const COOLDOWNS = [
  {value: 0, label: 'Без задержки'},
  {value: 60, label: '1 минута'},
  {value: 300, label: '5 минут'},
  {value: 600, label: '10 минут'},
  {value: 1800, label: '30 минут'},
  {value: 3600, label: '1 час'},
]

function ConfigForm({type, config, onChange}) {
  const update = (key, val) => onChange({...config, [key]: val})
  if (type === 'telegram') return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <label style={{fontSize: 12, color: '#9aa4b2'}}>Bot Token *
        <input className="input" value={config.bot_token || ''} onChange={e => update('bot_token', e.target.value)} placeholder="123456789:ABCdefGHIjklmnop..." style={{marginTop: 4, width: '100%'}} />
      </label>
      <label style={{fontSize: 12, color: '#9aa4b2'}}>Chat ID *
        <input className="input" value={config.chat_id || ''} onChange={e => update('chat_id', e.target.value)} placeholder="-1001234567890" style={{marginTop: 4, width: '100%'}} />
      </label>
    </div>
  )
  if (type === 'email') return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
        <label style={{fontSize: 12, color: '#9aa4b2'}}>SMTP Host *
          <input className="input" value={config.smtp_host || ''} onChange={e => update('smtp_host', e.target.value)} placeholder="smtp.gmail.com" style={{marginTop: 4, width: '100%'}} />
        </label>
        <label style={{fontSize: 12, color: '#9aa4b2'}}>SMTP Port
          <input className="input" type="number" value={config.smtp_port || 587} onChange={e => update('smtp_port', parseInt(e.target.value))} style={{marginTop: 4, width: '100%'}} />
        </label>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
        <label style={{fontSize: 12, color: '#9aa4b2'}}>SMTP User
          <input className="input" value={config.smtp_user || ''} onChange={e => update('smtp_user', e.target.value)} placeholder="user@gmail.com" style={{marginTop: 4, width: '100%'}} />
        </label>
        <label style={{fontSize: 12, color: '#9aa4b2'}}>SMTP Password
          <input className="input" type="password" value={config.smtp_password || ''} onChange={e => update('smtp_password', e.target.value)} style={{marginTop: 4, width: '100%'}} />
        </label>
      </div>
      <label style={{fontSize: 12, color: '#9aa4b2'}}>From Email
        <input className="input" value={config.from_email || ''} onChange={e => update('from_email', e.target.value)} placeholder="monitor@example.com" style={{marginTop: 4, width: '100%'}} />
      </label>
      <label style={{fontSize: 12, color: '#9aa4b2'}}>To Emails (через запятую) *
        <input className="input" value={(config.to_emails || []).join(', ')} onChange={e => update('to_emails', e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="admin@example.com, ops@example.com" style={{marginTop: 4, width: '100%'}} />
      </label>
      <label style={{fontSize: 12, color: '#9aa4b2', display: 'flex', alignItems: 'center', gap: 8}}>
        <input type="checkbox" checked={config.use_tls !== false} onChange={e => update('use_tls', e.target.checked)} /> Использовать TLS
      </label>
    </div>
  )
  if (type === 'webhook') return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <label style={{fontSize: 12, color: '#9aa4b2'}}>Webhook URL *
        <input className="input" value={config.url || ''} onChange={e => update('url', e.target.value)} placeholder="https://example.com/webhook" style={{marginTop: 4, width: '100%'}} />
      </label>
      <label style={{fontSize: 12, color: '#9aa4b2'}}>Custom Headers (JSON)
        <textarea className="input" rows={3} value={config.headers ? JSON.stringify(config.headers, null, 2) : ''} onChange={e => { try { update('headers', JSON.parse(e.target.value)) } catch {} }} placeholder='{"Authorization": "Bearer xxx"}' style={{marginTop: 4, width: '100%', fontFamily: 'monospace', fontSize: 12}} />
      </label>
    </div>
  )
  if (type === 'discord') return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <label style={{fontSize: 12, color: '#9aa4b2'}}>Webhook URL *
        <input className="input" value={config.webhook_url || ''} onChange={e => update('webhook_url', e.target.value)} placeholder="https://discord.com/api/webhooks/..." style={{marginTop: 4, width: '100%'}} />
      </label>
    </div>
  )
  return null
}

export default function Notifications() {
  const [tab, setTab] = useState('rules')

  // Channels state
  const [channels, setChannels] = useState([])
  const [chLoading, setChLoading] = useState(true)
  const [chError, setChError] = useState(null)
  const [showChAdd, setShowChAdd] = useState(false)
  const [editCh, setEditCh] = useState(null)
  const [chForm, setChForm] = useState({name: '', channel_type: 'telegram', config: {}, severity_filter: 'all', category_filter: 'all'})
  const [chFormError, setChFormError] = useState(null)
  const [chSaving, setChSaving] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testingId, setTestingId] = useState(null)
  
  // Filter for channel types
  const getChannelsByType = (types) => channels.filter(ch => types.includes(ch.channel_type))
  const emailWebhookChannels = getChannelsByType(['email', 'webhook'])
  const messengerChannels = getChannelsByType(['telegram', 'discord'])

  // Rules state
  const [rules, setRules] = useState([])
  const [rLoading, setRLoading] = useState(true)
  const [rError, setRError] = useState(null)
  const [showRuleWizard, setShowRuleWizard] = useState(false)
  const [editRule, setEditRule] = useState(null)
  const [wizardStep, setWizardStep] = useState(0)
  const [ruleForm, setRuleForm] = useState({name: '', org_id: null, target_type: '', target_id: '', metric: 'cpu', condition: 'gt', threshold_value: '80', severity: 'warning', channel_id: null, cooldown: 300})
  const [rFormError, setRFormError] = useState(null)
  const [rSaving, setRSaving] = useState(false)

  // Telegram state
  const [bots, setBots] = useState([])
  const [tgLoading, setTgLoading] = useState(true)
  const [tgError, setTgError] = useState(null)
  const [selectedBot, setSelectedBot] = useState(null)
  const [botUsers, setBotUsers] = useState([])
  const [botUsersLoading, setBotUsersLoading] = useState(false)
  const [editTgUser, setEditTgUser] = useState(null)
  const [tgUserForm, setTgUserForm] = useState({org_id: null, notify_critical: true, notify_warning: true, notify_info: false, notify_categories: []})
  const [tgUserSaving, setTgUserSaving] = useState(false)
  const [tgSendModal, setTgSendModal] = useState(null)
  const [tgSendMsg, setTgSendMsg] = useState('')
  const [tgSending, setTgSending] = useState(false)
  const [tgSendResult, setTgSendResult] = useState(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [importingUsers, setImportingUsers] = useState(false)
  const [showAddTgUser, setShowAddTgUser] = useState(false)
  const [addTgUserForm, setAddTgUserForm] = useState({telegram_id: '', username: '', first_name: '', last_name: '', org_id: null, notify_critical: true, notify_warning: true, notify_info: false, notify_categories: []})
  const [addTgUserError, setAddTgUserError] = useState(null)
  const [addTgUserSaving, setAddTgUserSaving] = useState(false)

  // Data for selectors
  const [orgs, setOrgs] = useState([])
  const [servers, setServers] = useState([])
  const [websites, setWebsites] = useState([])
  const [hypervisors, setHypervisors] = useState([])

  const loadChannels = useCallback(async () => {
    try { setChError(null);
; const d = await apiFetch('/api/notifications/channels'); setChannels(d.channels || []) }
    catch (err) { setChError(err.message) } finally { setChLoading(false) }
  }, [])

  const loadRules = useCallback(async () => {
    try { setRError(null);
; const d = await apiFetch('/api/notifications/rules'); setRules(d.rules || []) }
    catch (err) { setRError(err.message) } finally { setRLoading(false) }
  }, [])

  const loadBots = useCallback(async () => {
    try { setTgError(null);
; const d = await apiFetch('/api/telegram/bots'); setBots(d.bots || []) }
    catch (err) { setTgError(err.message) } finally { setTgLoading(false) }
  }, [])

  const loadBotUsers = useCallback(async (botId) => {
    if (!botId) return
    setBotUsersLoading(true)
    try {
; const d = await apiFetch(`/api/telegram/bots/${botId}/users`); setBotUsers(d.users || []) }
    catch {} finally { setBotUsersLoading(false) }
  }, [])

  const loadResources = useCallback(async () => {
    try {

      const [orgData, srvData, wsData] = await Promise.all([apiFetch('/api/organizations'), apiFetch('/api/servers'), apiFetch('/api/websites')])
      setOrgs(orgData.organizations || []); setServers(srvData.servers || []); setWebsites(wsData.websites || [])
      try { const hvData = await apiFetch('/api/vm/hypervisors'); setHypervisors(hvData.hypervisors || []) } catch { setHypervisors([]) }
    } catch {}
  }, [])

  useEffect(() => { loadChannels(); loadRules(); loadBots(); loadResources() }, [])

  useEffect(() => { if (selectedBot) loadBotUsers(selectedBot.id) }, [selectedBot])

  // Refresh bot users when switching back to Telegram tab
  useEffect(() => { if (tab === 'telegram' && selectedBot) loadBotUsers(selectedBot.id) }, [tab])

  // ---- Channel handlers ----
  function openChAdd() { 
    setEditCh(null)
    const defaultType = tab === 'emailWebhook' ? 'email' : 'telegram'
    setChForm({name: '', channel_type: defaultType, config: {}, severity_filter: 'all', category_filter: 'all'})
    setChFormError(null)
    setShowChAdd(true)
  }
  function openChEdit(ch) { setEditCh(ch); setChForm({name: ch.name, channel_type: ch.channel_type, config: {...ch.config}, severity_filter: ch.severity_filter, category_filter: ch.category_filter}); setChFormError(null); setShowChAdd(true) }
  async function handleChSave(e) {
    e.preventDefault(); setChFormError(null)
    if (!chForm.name.trim()) { setChFormError('Название обязательно'); return }
    setChSaving(true)
    try {

      if (editCh) await apiFetch(`/api/notifications/channels/${editCh.id}`, {method: 'PUT', body: JSON.stringify({name: chForm.name, config: chForm.config, severity_filter: chForm.severity_filter, category_filter: chForm.category_filter})})
      else await apiFetch('/api/notifications/channels', {method: 'POST', body: JSON.stringify(chForm)})
      setShowChAdd(false); await loadChannels()
    } catch (err) { setChFormError(err.message || 'Ошибка') } finally { setChSaving(false) }
  }
  async function handleChDelete(id) { if (!confirm('Удалить канал уведомлений?')) return; try {
; await apiFetch(`/api/notifications/channels/${id}`, {method: 'DELETE'}); await loadChannels() } catch { setChError('Ошибка удаления') } }
  async function handleChToggle(id) { try {
; await apiFetch(`/api/notifications/channels/${id}/toggle`, {method: 'POST'}); await loadChannels() } catch { setChError('Ошибка') } }
  async function handleChTest(id) { setTestingId(id); setTestResult(null); try {
; const res = await apiFetch(`/api/notifications/channels/${id}/test`, {method: 'POST'}); setTestResult({id, ...res}) } catch (err) { setTestResult({id, success: false, message: err.message}) } finally { setTestingId(null) } }

  // ---- Rule handlers ----
  function openRuleWizard() { setEditRule(null); setWizardStep(0); setRuleForm({name: '', org_id: null, target_type: '', target_id: '', metric: 'cpu', condition: 'gt', threshold_value: '80', severity: 'warning', channel_id: null, cooldown: 300}); setRFormError(null); setShowRuleWizard(true) }
  function openRuleEdit(rule) { setEditRule(rule); setWizardStep(0); setRuleForm({name: rule.name, org_id: rule.org_id, target_type: rule.target_type || '', target_id: rule.target_id || '', metric: rule.metric, condition: rule.condition, threshold_value: rule.threshold_value, severity: rule.severity, channel_id: rule.channel_id, cooldown: rule.cooldown || 300}); setRFormError(null); setShowRuleWizard(true) }
  async function handleRuleSave() {
    setRFormError(null)
    if (!ruleForm.name.trim()) { setRFormError('Название обязательно'); return }
    if (!ruleForm.threshold_value) { setRFormError('Укажите пороговое значение'); return }
    setRSaving(true)
    try {

      const body = {...ruleForm, org_id: ruleForm.org_id || null, target_type: ruleForm.target_type || null, target_id: ruleForm.target_id || null, channel_id: ruleForm.channel_id || null}
      if (editRule) await apiFetch(`/api/notifications/rules/${editRule.id}`, {method: 'PUT', body: JSON.stringify(body)})
      else await apiFetch('/api/notifications/rules', {method: 'POST', body: JSON.stringify(body)})
      setShowRuleWizard(false); await loadRules()
    } catch (err) { setRFormError(err.message || 'Ошибка') } finally { setRSaving(false) }
  }
  async function handleRuleDelete(id) { if (!confirm('Удалить правило?')) return; try {
; await apiFetch(`/api/notifications/rules/${id}`, {method: 'DELETE'}); await loadRules() } catch { setRError('Ошибка') } }
  async function handleRuleToggle(id) { try {
; await apiFetch(`/api/notifications/rules/${id}/toggle`, {method: 'POST'}); await loadRules() } catch { setRError('Ошибка') } }

  // ---- Telegram user handlers ----
  function openAddTgUser() { setAddTgUserForm({telegram_id: '', username: '', first_name: '', last_name: '', org_id: null, notify_critical: true, notify_warning: true, notify_info: false, notify_categories: []}); setAddTgUserError(null); setShowAddTgUser(true) }
  async function handleAddTgUser() {
    if (!selectedBot) return
    if (!addTgUserForm.telegram_id.trim()) { setAddTgUserError('Telegram ID обязателен'); return }
    setAddTgUserSaving(true); setAddTgUserError(null)
    try {

      await apiFetch(`/api/telegram/bots/${selectedBot.id}/users`, {method: 'POST', body: JSON.stringify(addTgUserForm)})
      setShowAddTgUser(false); await loadBotUsers(selectedBot.id)
    } catch (err) { setAddTgUserError(err.message || 'Ошибка создания') } finally { setAddTgUserSaving(false) }
  }
  function openTgUserEdit(u) { setEditTgUser(u); setTgUserForm({org_id: u.org_id || null, notify_critical: u.notify_critical, notify_warning: u.notify_warning, notify_info: u.notify_info, notify_categories: u.notify_categories || []}) }
  async function handleTgUserSave() {
    if (!selectedBot || !editTgUser) return
    setTgUserSaving(true)
    try {
; await apiFetch(`/api/telegram/bots/${selectedBot.id}/users/${editTgUser.id}`, {method: 'PUT', body: JSON.stringify(tgUserForm)}); setEditTgUser(null); await loadBotUsers(selectedBot.id) }
    catch {} finally { setTgUserSaving(false) }
  }
  async function handleTgUserToggle(uid) {
    if (!selectedBot) return
    try {
; await apiFetch(`/api/telegram/bots/${selectedBot.id}/users/${uid}/toggle`, {method: 'POST'}); await loadBotUsers(selectedBot.id) } catch {}
  }
  async function handleTgUserDelete(uid) {
    if (!confirm('Удалить пользователя?')) return
    if (!selectedBot) return
    try {
; await apiFetch(`/api/telegram/bots/${selectedBot.id}/users/${uid}`, {method: 'DELETE'}); await loadBotUsers(selectedBot.id) } catch {}
  }
  async function handleTgSend() {
    if (!selectedBot || !tgSendModal || !tgSendMsg.trim()) return
    setTgSending(true); setTgSendResult(null)
    try {
; const r = await apiFetch(`/api/telegram/bots/${selectedBot.id}/users/${tgSendModal.id}/send`, {method: 'POST', body: JSON.stringify({message: tgSendMsg})}); setTgSendResult(r) }
    catch (err) { setTgSendResult({sent: false, error: err.message}) } finally { setTgSending(false) }
  }
  async function handleSetupWebhook() {
    if (!selectedBot || !webhookUrl.trim()) return
    setWebhookSaving(true)
    try {
; await apiFetch(`/api/telegram/bots/${selectedBot.id}/setup-webhook`, {method: 'POST', body: JSON.stringify({webhook_url: webhookUrl})}); alert('Webhook установлен!') }
    catch {} finally { setWebhookSaving(false) }
  }
  async function handleRemoveWebhook() {
    if (!selectedBot) return
    try {
; await apiFetch(`/api/telegram/bots/${selectedBot.id}/webhook`, {method: 'DELETE'}); alert('Webhook удалён') } catch {}
  }
  async function handleImportUsers() {
    if (!selectedBot) return
    setImportingUsers(true)
    try {
; const r = await apiFetch(`/api/telegram/bots/${selectedBot.id}/import-users`, {method: 'POST'}); alert(`Импортировано: ${r.imported} пользователей`); await loadBotUsers(selectedBot.id) }
    catch {} finally { setImportingUsers(false) }
  }

  const filteredTargets = (() => {
    if (ruleForm.target_type === 'server') return servers.filter(s => !ruleForm.org_id || s.org_id === ruleForm.org_id)
    if (ruleForm.target_type === 'website') return websites.filter(w => !ruleForm.org_id || w.org_id === ruleForm.org_id)
    if (ruleForm.target_type === 'hypervisor') return hypervisors
    return []
  })()

  const availableMetrics = METRICS.filter(m => {
    if (m.value === 'any') return true
    if (!ruleForm.target_type) return true
    if (ruleForm.target_type === 'server') return ['server', 'general'].includes(m.group)
    if (ruleForm.target_type === 'website') return ['website', 'general'].includes(m.group)
    return true
  })

  const WIZARD_STEPS = ['Область', 'Критерий', 'Уведомление', 'Обзор']

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar />
        <main className="page">
          {/* Header */}
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12}}>
            <div>
              <h1 style={{margin: 0, fontSize: 22}}>🔔 Уведомления</h1>
              <p style={{color: '#9aa4b2', margin: '4px 0 0', fontSize: 13}}>Правила уведомлений, каналы доставки и Telegram-бот</p>
            </div>
            <div style={{display: 'flex', gap: 8}}>
              {tab === 'rules' && <button className="btn btn-primary" onClick={openRuleWizard}>+ Создать правило</button>}
              {(tab === 'channels' || tab === 'emailWebhook') && <button className="btn btn-primary" onClick={openChAdd}>+ Добавить канал</button>}
            </div>
          </div>

          {/* Tabs */}
          <div style={{display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #1a2940'}}>
            {[
              {key: 'rules', label: '📋 Правила', count: rules.length},
              {key: 'channels', label: '📡 Каналы', count: messengerChannels.length},
              {key: 'emailWebhook', label: '📧 Email & Webhook', count: emailWebhookChannels.length},
              {key: 'telegram', label: '📱 Telegram', count: bots.length},
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '10px 20px', background: 'none', border: 'none',
                borderBottom: tab === t.key ? '2px solid #00d4ff' : '2px solid transparent',
                color: tab === t.key ? '#00d4ff' : '#9aa4b2', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                marginBottom: -2, transition: 'all 0.2s'
              }}>
                {t.label} <span style={{fontSize: 11, opacity: 0.7, marginLeft: 4}}>({t.count})</span>
              </button>
            ))}
          </div>

          {/* ============ RULES TAB ============ */}
          {tab === 'rules' && (
            <>
              {rError && <div className="card" style={{background: '#ef444420', border: '1px solid #ef4444', color: '#ef4444', marginBottom: 16, padding: 12}}>{rError}</div>}
              {rLoading ? <div style={{textAlign: 'center', color: '#9aa4b2', padding: 40}}>Загрузка...</div> : rules.length === 0 ? (
                <div className="card" style={{textAlign: 'center', padding: 48}}>
                  <div style={{fontSize: 48, marginBottom: 12}}>📋</div>
                  <div style={{color: '#9aa4b2', fontSize: 16, fontWeight: 600}}>Нет правил уведомлений</div>
                  <div style={{color: '#6b7280', fontSize: 13, marginTop: 4, maxWidth: 400, margin: '4px auto 0'}}>Создайте правило, чтобы получать уведомления при достижении метрик пороговых значений</div>
                  <button className="btn btn-primary" onClick={openRuleWizard} style={{marginTop: 16}}>+ Создать первое правило</button>
                </div>
              ) : (
                <div style={{display: 'grid', gap: 10}}>
                  {rules.map(r => {
                    const metricInfo = METRICS.find(m => m.value === r.metric)
                    const condInfo = CONDITIONS.find(c => c.value === r.condition)
                    const sevColors = {critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6'}
                    return (
                      <div key={r.id} className="card" style={{padding: 16, opacity: r.is_enabled ? 1 : 0.5, transition: 'opacity 0.2s'}}>
                        <div style={{display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap'}}>
                          <div style={{width: 42, height: 42, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: (sevColors[r.severity] || '#3b82f6') + '20', border: `1px solid ${sevColors[r.severity] || '#3b82f6'}40`, flexShrink: 0}}>{metricInfo?.icon || '📊'}</div>
                          <div style={{flex: 1, minWidth: 200}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                              <span style={{fontWeight: 600, fontSize: 15}}>{r.name}</span>
                              <span style={{fontSize: 10, padding: '2px 8px', borderRadius: 10, background: (sevColors[r.severity] || '#3b82f6') + '30', color: sevColors[r.severity] || '#3b82f6', fontWeight: 700, textTransform: 'uppercase'}}>{r.severity}</span>
                              {!r.is_enabled && <span style={{fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#ef444430', color: '#ef4444', fontWeight: 600}}>ВЫКЛ</span>}
                            </div>
                            <div style={{fontSize: 13, color: '#9aa4b2', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 16}}>
                              <span>📊 {metricInfo?.label || r.metric} {condInfo?.short || r.condition} {r.threshold_value}{metricInfo?.unit || ''}</span>
                              {r.target_name && <span>🎯 {r.target_name}</span>}
                              {!r.target_name && r.target_type && <span>🎯 Все {TARGET_TYPES.find(t => t.value === r.target_type)?.label?.toLowerCase() || r.target_type}</span>}
                              {!r.target_type && <span>🎯 Все ресурсы</span>}
                              {r.org_name && <span>🏢 {r.org_name}</span>}
                              {r.channel_name && <span>📡 {r.channel_name}</span>}
                            </div>
                            <div style={{fontSize: 11, color: '#4b5563', marginTop: 4}}>
                              Сработало: {r.trigger_count || 0} раз
                              {r.last_triggered && <> · Последний: {new Date(r.last_triggered).toLocaleString('ru')}</>}
                              {r.cooldown > 0 && <> · Cooldown: {r.cooldown >= 3600 ? `${r.cooldown/3600}ч` : r.cooldown >= 60 ? `${r.cooldown/60}мин` : `${r.cooldown}с`}</>}
                            </div>
                          </div>
                          <div style={{display: 'flex', gap: 6, flexShrink: 0}}>
                            <button className="btn" onClick={() => handleRuleToggle(r.id)} style={{fontSize: 12, padding: '6px 10px', background: '#1a2940', color: r.is_enabled ? '#facc15' : '#4ade80', border: `1px solid ${r.is_enabled ? '#facc1540' : '#4ade8040'}`}}>{r.is_enabled ? '⏸' : '▶'}</button>
                            <button className="btn" onClick={() => openRuleEdit(r)} style={{fontSize: 12, padding: '6px 10px', background: '#1a2940', color: '#9aa4b2', border: '1px solid #1a294080'}}>✏️</button>
                            <button className="btn" onClick={() => handleRuleDelete(r.id)} style={{fontSize: 12, padding: '6px 10px', background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440'}}>🗑</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ============ CHANNELS TAB ============ */}
          {tab === 'channels' && (
            <>
              {chError && <div className="card" style={{background: '#ef444420', border: '1px solid #ef4444', color: '#ef4444', marginBottom: 16, padding: 12}}>{chError}</div>}
              {chLoading ? <div style={{textAlign: 'center', color: '#9aa4b2', padding: 40}}>Загрузка...</div> : messengerChannels.length === 0 ? (
                <div className="card" style={{textAlign: 'center', padding: 48}}>
                  <div style={{fontSize: 48, marginBottom: 12}}>📡</div>
                  <div style={{color: '#9aa4b2', fontSize: 16, fontWeight: 600}}>Каналы не настроены</div>
                  <div style={{color: '#6b7280', fontSize: 13, marginTop: 4}}>Добавьте Telegram или Discord</div>
                  <button className="btn btn-primary" onClick={openChAdd} style={{marginTop: 16}}>+ Добавить канал</button>
                </div>
              ) : (
                <div style={{display: 'grid', gap: 10}}>
                  {messengerChannels.map(ch => {
                    const ct = CHANNEL_TYPES.find(c => c.value === ch.channel_type)
                    return (
                      <div key={ch.id} className="card" style={{padding: 16, display: 'flex', alignItems: 'center', gap: 14, opacity: ch.is_enabled ? 1 : 0.5, transition: 'opacity 0.2s', flexWrap: 'wrap'}}>
                        <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, fontSize: 20, background: (ct?.color || '#666') + '20', border: `1px solid ${ct?.color || '#666'}40`, flexShrink: 0}}>{ct?.icon || '🔔'}</span>
                        <div style={{flex: 1, minWidth: 180}}>
                          <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                            <span style={{fontWeight: 600, fontSize: 15}}>{ch.name}</span>
                            <span style={{fontSize: 10, padding: '2px 8px', borderRadius: 10, background: (ct?.color || '#666') + '30', color: ct?.color || '#999', fontWeight: 600, textTransform: 'uppercase'}}>{ct?.label || ch.channel_type}</span>
                            {!ch.is_enabled && <span style={{fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#ef444430', color: '#ef4444', fontWeight: 600}}>ВЫКЛ</span>}
                          </div>
                          <div style={{fontSize: 12, color: '#6b7280', marginTop: 4}}>
                            Серьезность: <span style={{color: '#9aa4b2'}}>{SEVERITIES.find(s => s.value === ch.severity_filter)?.label || ch.severity_filter}</span>
                            {' · '}Категория: <span style={{color: '#9aa4b2'}}>{CATEGORIES.find(c => c.value === ch.category_filter)?.label || ch.category_filter}</span>
                          </div>
                          {testResult?.id === ch.id && (
                            <div style={{fontSize: 12, marginTop: 6, padding: '4px 8px', borderRadius: 4, background: testResult.success ? '#4ade8020' : '#ef444420', color: testResult.success ? '#4ade80' : '#ef4444', display: 'inline-block'}}>
                              {testResult.success ? '✓ Тест отправлен!' : `✗ ${testResult.message}`}
                            </div>
                          )}
                        </div>
                        <div style={{display: 'flex', gap: 6, flexShrink: 0}}>
                          <button className="btn" onClick={() => handleChTest(ch.id)} disabled={testingId === ch.id} style={{fontSize: 12, padding: '6px 12px', background: '#1a2940', color: '#00d4ff', border: '1px solid #00d4ff40'}}>{testingId === ch.id ? '...' : '🧪 Тест'}</button>
                          <button className="btn" onClick={() => handleChToggle(ch.id)} style={{fontSize: 12, padding: '6px 12px', background: '#1a2940', color: ch.is_enabled ? '#facc15' : '#4ade80', border: `1px solid ${ch.is_enabled ? '#facc1540' : '#4ade8040'}`}}>{ch.is_enabled ? '⏸ Выкл' : '▶ Вкл'}</button>
                          <button className="btn" onClick={() => openChEdit(ch)} style={{fontSize: 12, padding: '6px 10px', background: '#1a2940', color: '#9aa4b2', border: '1px solid #1a294080'}}>✏️</button>
                          <button className="btn" onClick={() => handleChDelete(ch.id)} style={{fontSize: 12, padding: '6px 10px', background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440'}}>🗑</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="card" style={{marginTop: 24, padding: 16}}>
                <h4 style={{margin: '0 0 12px', fontSize: 14, color: '#9aa4b2'}}>ℹ️ Мессенджеры</h4>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10}}>
                  {CHANNEL_TYPES.filter(ct => ['telegram', 'discord'].includes(ct.value)).map(ct => (
                    <div key={ct.value} style={{padding: 12, background: '#0a1628', borderRadius: 8, border: '1px solid #1a2940'}}>
                      <div style={{fontSize: 15, marginBottom: 4}}>{ct.icon} <b>{ct.label}</b></div>
                      <div style={{fontSize: 11, color: '#6b7280', lineHeight: 1.4}}>
                        {ct.value === 'telegram' && 'Бот через @BotFather, токен + Chat ID'}
                        {ct.value === 'discord' && 'Discord Webhook для embed-сообщений'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ============ EMAIL & WEBHOOK TAB ============ */}
          {tab === 'emailWebhook' && (
            <>
              {chError && <div className="card" style={{background: '#ef444420', border: '1px solid #ef4444', color: '#ef4444', marginBottom: 16, padding: 12}}>{chError}</div>}
              {chLoading ? <div style={{textAlign: 'center', color: '#9aa4b2', padding: 40}}>Загрузка...</div> : emailWebhookChannels.length === 0 ? (
                <div className="card" style={{textAlign: 'center', padding: 48}}>
                  <div style={{fontSize: 48, marginBottom: 12}}>📧</div>
                  <div style={{color: '#9aa4b2', fontSize: 16, fontWeight: 600}}>Email и Webhook не настроены</div>
                  <div style={{color: '#6b7280', fontSize: 13, marginTop: 4}}>Добавьте SMTP-сервер для Email или Webhook для HTTP-уведомлений</div>
                  <button className="btn btn-primary" onClick={openChAdd} style={{marginTop: 16}}>+ Добавить канал</button>
                </div>
              ) : (
                <div style={{display: 'grid', gap: 10}}>
                  {emailWebhookChannels.map(ch => {
                    const ct = CHANNEL_TYPES.find(c => c.value === ch.channel_type)
                    return (
                      <div key={ch.id} className="card" style={{padding: 16, display: 'flex', alignItems: 'column', gap: 14, opacity: ch.is_enabled ? 1 : 0.5, transition: 'opacity 0.2s'}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 14, width: '100%', flexWrap: 'wrap'}}>
                          <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 10, fontSize: 20, background: (ct?.color || '#666') + '20', border: `1px solid ${ct?.color || '#666'}40`, flexShrink: 0}}>{ct?.icon || '🔔'}</span>
                          <div style={{flex: 1, minWidth: 180}}>
                            <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                              <span style={{fontWeight: 600, fontSize: 15}}>{ch.name}</span>
                              <span style={{fontSize: 10, padding: '2px 8px', borderRadius: 10, background: (ct?.color || '#666') + '30', color: ct?.color || '#999', fontWeight: 600, textTransform: 'uppercase'}}>{ct?.label || ch.channel_type}</span>
                              {!ch.is_enabled && <span style={{fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#ef444430', color: '#ef4444', fontWeight: 600}}>ВЫКЛ</span>}
                            </div>
                            <div style={{fontSize: 12, color: '#6b7280', marginTop: 4}}>
                              Серьезность: <span style={{color: '#9aa4b2'}}>{SEVERITIES.find(s => s.value === ch.severity_filter)?.label || ch.severity_filter}</span>
                              {' · '}Категория: <span style={{color: '#9aa4b2'}}>{CATEGORIES.find(c => c.value === ch.category_filter)?.label || ch.category_filter}</span>
                            </div>
                            {ch.channel_type === 'email' && (
                              <div style={{fontSize: 11, color: '#4b5563', marginTop: 6}}>
                                📧 {(ch.config?.to_emails || []).slice(0, 2).join(', ')}{ch.config?.to_emails?.length > 2 ? ` +${ch.config.to_emails.length - 2}` : ''}
                              </div>
                            )}
                            {ch.channel_type === 'webhook' && (
                              <div style={{fontSize: 11, color: '#4b5563', marginTop: 6, wordBreak: 'break-all'}}>
                                🔗 {ch.config?.url?.substring(0, 60)}...
                              </div>
                            )}
                            {testResult?.id === ch.id && (
                              <div style={{fontSize: 12, marginTop: 6, padding: '4px 8px', borderRadius: 4, background: testResult.success ? '#4ade8020' : '#ef444420', color: testResult.success ? '#4ade80' : '#ef4444', display: 'inline-block'}}>
                                {testResult.success ? '✓ Тест отправлен!' : `✗ ${testResult.message}`}
                              </div>
                            )}
                          </div>
                          <div style={{display: 'flex', gap: 6, flexShrink: 0}}>
                            <button className="btn" onClick={() => handleChTest(ch.id)} disabled={testingId === ch.id} style={{fontSize: 12, padding: '6px 12px', background: '#1a2940', color: '#00d4ff', border: '1px solid #00d4ff40'}}>{testingId === ch.id ? '...' : '🧪 Тест'}</button>
                            <button className="btn" onClick={() => handleChToggle(ch.id)} style={{fontSize: 12, padding: '6px 12px', background: '#1a2940', color: ch.is_enabled ? '#facc15' : '#4ade80', border: `1px solid ${ch.is_enabled ? '#facc1540' : '#4ade8040'}`}}>{ch.is_enabled ? '⏸ Выкл' : '▶ Вкл'}</button>
                            <button className="btn" onClick={() => openChEdit(ch)} style={{fontSize: 12, padding: '6px 10px', background: '#1a2940', color: '#9aa4b2', border: '1px solid #1a294080'}}>✏️</button>
                            <button className="btn" onClick={() => handleChDelete(ch.id)} style={{fontSize: 12, padding: '6px 10px', background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440'}}>🗑</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="card" style={{marginTop: 24, padding: 16}}>
                <h4 style={{margin: '0 0 12px', fontSize: 14, color: '#9aa4b2'}}>ℹ️ Email и Webhook</h4>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10}}>
                  {CHANNEL_TYPES.filter(ct => ['email', 'webhook'].includes(ct.value)).map(ct => (
                    <div key={ct.value} style={{padding: 12, background: '#0a1628', borderRadius: 8, border: '1px solid #1a2940'}}>
                      <div style={{fontSize: 15, marginBottom: 4}}>{ct.icon} <b>{ct.label}</b></div>
                      <div style={{fontSize: 11, color: '#6b7280', lineHeight: 1.4}}>
                        {ct.value === 'email' && 'SMTP-сервер для email-уведомлений'}
                        {ct.value === 'webhook' && 'JSON POST на указанный URL'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ============ TELEGRAM TAB ============ */}
          {tab === 'telegram' && (
            <>
              {tgError && <div className="card" style={{background: '#ef444420', border: '1px solid #ef4444', color: '#ef4444', marginBottom: 16, padding: 12}}>{tgError}</div>}

              {/* Bot selector */}
              {tgLoading ? <div style={{textAlign: 'center', color: '#9aa4b2', padding: 40}}>Загрузка...</div> : bots.length === 0 ? (
                <div className="card" style={{textAlign: 'center', padding: 48}}>
                  <div style={{fontSize: 48, marginBottom: 12}}>🤖</div>
                  <div style={{color: '#9aa4b2', fontSize: 16, fontWeight: 600}}>Нет Telegram-ботов</div>
                  <div style={{color: '#6b7280', fontSize: 13, marginTop: 4}}>Добавьте бота на странице <b>Telegram</b> в разделе интеграций</div>
                </div>
              ) : (
                <>
                  {/* Bot cards */}
                  <div style={{display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap'}}>
                    {bots.map(b => (
                      <button key={b.id} onClick={() => setSelectedBot(b)} style={{
                        padding: '14px 20px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', minWidth: 200, transition: 'all 0.2s',
                        border: `2px solid ${selectedBot?.id === b.id ? '#229ED9' : '#1a2940'}`,
                        background: selectedBot?.id === b.id ? '#229ED915' : '#0d1b2a', color: '#fff',
                      }}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                          <span style={{fontSize: 24}}>🤖</span>
                          <div>
                            <div style={{fontWeight: 600, fontSize: 14}}>{b.name}</div>
                            <div style={{fontSize: 11, color: '#6b7280'}}>
                              {b.last_username ? `@${b.last_username}` : 'username неизвестен'}
                              {' · '}<span style={{color: b.last_status === 'online' ? '#4ade80' : '#ef4444'}}>{b.last_status === 'online' ? '🟢 Online' : '🔴 Offline'}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Selected bot panel */}
                  {selectedBot && (
                    <>
                      {/* Webhook setup */}
                      <div className="card" style={{padding: 16, marginBottom: 16}}>
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10}}>
                          <div>
                            <h4 style={{margin: 0, fontSize: 14}}>⚙️ Webhook для авто-регистрации</h4>
                            <p style={{fontSize: 12, color: '#6b7280', margin: '4px 0 0'}}>Установите webhook, чтобы пользователи регистрировались автоматически при /start</p>
                          </div>
                          <div style={{display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
                            <input className="input" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)}
                              placeholder={`https://ваш-домен/api/telegram/bots/${selectedBot.id}/webhook`}
                              style={{width: 360, fontSize: 12}} />
                            <button className="btn btn-primary" onClick={handleSetupWebhook} disabled={webhookSaving} style={{fontSize: 12, whiteSpace: 'nowrap'}}>
                              {webhookSaving ? '...' : '🔗 Установить'}
                            </button>
                            <button className="btn" onClick={handleRemoveWebhook} style={{fontSize: 12, background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440', whiteSpace: 'nowrap'}}>🗑 Удалить</button>
                          </div>
                        </div>
                      </div>

                      {/* Actions bar */}
                      <div style={{display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap'}}>
                        <button className="btn btn-primary" onClick={openAddTgUser} style={{fontSize: 12}}>
                          ➕ Добавить пользователя
                        </button>
                        <button className="btn" onClick={handleImportUsers} disabled={importingUsers} style={{fontSize: 12, background: '#229ED920', color: '#229ED9', border: '1px solid #229ED940'}}>
                          {importingUsers ? '⏳ Импорт...' : '📥 Импорт из обновлений'}
                        </button>
                        <button className="btn" onClick={() => loadBotUsers(selectedBot.id)} style={{fontSize: 12, background: '#1a2940', color: '#9aa4b2', border: '1px solid #1a294080'}}>🔄 Обновить</button>
                      </div>

                      {/* Users list */}
                      {botUsersLoading ? <div style={{textAlign: 'center', color: '#9aa4b2', padding: 30}}>Загрузка пользователей...</div> : botUsers.length === 0 ? (
                        <div className="card" style={{textAlign: 'center', padding: 40}}>
                          <div style={{fontSize: 40, marginBottom: 8}}>👥</div>
                          <div style={{color: '#9aa4b2', fontSize: 15, fontWeight: 600}}>Нет зарегистрированных пользователей</div>
                          <div style={{color: '#6b7280', fontSize: 12, marginTop: 4}}>Установите webhook и попросите пользователей отправить /start боту, или нажмите «Импорт»</div>
                        </div>
                      ) : (
                        <div style={{display: 'grid', gap: 10}}>
                          {botUsers.map(u => (
                            <div key={u.id} className="card" style={{padding: 16, opacity: u.is_active ? 1 : 0.45, transition: 'opacity 0.2s'}}>
                              <div style={{display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap'}}>
                                {/* Avatar */}
                                <div style={{width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: '#229ED920', border: '1px solid #229ED940', flexShrink: 0}}>👤</div>
                                {/* Info */}
                                <div style={{flex: 1, minWidth: 200}}>
                                  <div style={{display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap'}}>
                                    <span style={{fontWeight: 600, fontSize: 15}}>{u.first_name || 'Без имени'}{u.last_name ? ` ${u.last_name}` : ''}</span>
                                    {u.username && <span style={{fontSize: 11, color: '#229ED9'}}>@{u.username}</span>}
                                    {!u.is_active && <span style={{fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#ef444430', color: '#ef4444', fontWeight: 600}}>ВЫКЛ</span>}
                                  </div>
                                  <div style={{fontSize: 12, color: '#6b7280', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 14}}>
                                    <span>🆔 {u.telegram_id}</span>
                                    {u.org_name ? <span>🏢 {u.org_name}</span> : <span style={{color: '#f59e0b'}}>⚠️ Организация не назначена</span>}
                                  </div>
                                  <div style={{fontSize: 11, color: '#4b5563', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8}}>
                                    <span style={{color: u.notify_critical ? '#ef4444' : '#333'}}>● Critical {u.notify_critical ? '✓' : '✗'}</span>
                                    <span style={{color: u.notify_warning ? '#f59e0b' : '#333'}}>● Warning {u.notify_warning ? '✓' : '✗'}</span>
                                    <span style={{color: u.notify_info ? '#3b82f6' : '#333'}}>● Info {u.notify_info ? '✓' : '✗'}</span>
                                    {u.notify_categories?.length > 0 && <span>📂 {u.notify_categories.join(', ')}</span>}
                                    {(!u.notify_categories || u.notify_categories.length === 0) && <span>📂 Все категории</span>}
                                  </div>
                                  <div style={{fontSize: 10, color: '#374151', marginTop: 2}}>Регистрация: {u.registered_at ? new Date(u.registered_at).toLocaleString('ru') : '—'}</div>
                                </div>
                                {/* Actions */}
                                <div style={{display: 'flex', gap: 6, flexShrink: 0}}>
                                  <button className="btn" onClick={() => openTgUserEdit(u)} style={{fontSize: 12, padding: '6px 10px', background: '#229ED920', color: '#229ED9', border: '1px solid #229ED940'}}>⚙️</button>
                                  <button className="btn" onClick={() => {setTgSendModal(u); setTgSendMsg(''); setTgSendResult(null)}} style={{fontSize: 12, padding: '6px 10px', background: '#4ade8020', color: '#4ade80', border: '1px solid #4ade8040'}}>💬</button>
                                  <button className="btn" onClick={() => handleTgUserToggle(u.id)} style={{fontSize: 12, padding: '6px 10px', background: '#1a2940', color: u.is_active ? '#facc15' : '#4ade80', border: `1px solid ${u.is_active ? '#facc1540' : '#4ade8040'}`}}>{u.is_active ? '⏸' : '▶'}</button>
                                  <button className="btn" onClick={() => handleTgUserDelete(u.id)} style={{fontSize: 12, padding: '6px 10px', background: '#ef444420', color: '#ef4444', border: '1px solid #ef444440'}}>🗑</button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* How it works */}
              <div className="card" style={{marginTop: 24, padding: 16}}>
                <h4 style={{margin: '0 0 12px', fontSize: 14, color: '#9aa4b2'}}>ℹ️ Как это работает</h4>
                <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10}}>
                  {[
                    {icon: '1️⃣', title: 'Добавьте бота', desc: 'Создайте бота через @BotFather и добавьте его на странице Telegram'},
                    {icon: '2️⃣', title: 'Установите Webhook', desc: 'Укажите URL вашего сервера для авто-регистрации пользователей'},
                    {icon: '3️⃣', title: 'Пользователи пишут /start', desc: 'Каждый кто напишет /start — автоматически зарегистрируется'},
                    {icon: '4️⃣', title: 'Настройте уведомления', desc: 'Назначьте организацию и выберите какие уведомления отправлять'},
                  ].map((s, i) => (
                    <div key={i} style={{padding: 12, background: '#0a1628', borderRadius: 8, border: '1px solid #1a2940'}}>
                      <div style={{fontSize: 18, marginBottom: 6}}>{s.icon} <b style={{fontSize: 13}}>{s.title}</b></div>
                      <div style={{fontSize: 11, color: '#6b7280', lineHeight: 1.4}}>{s.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ============ CHANNEL MODAL ============ */}
          {showChAdd && (
            <div style={{position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16}} onClick={() => setShowChAdd(false)}>
              <div className="card" style={{width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', padding: 24}} onClick={e => e.stopPropagation()}>
                <h3 style={{marginTop: 0}}>{editCh ? 'Редактировать канал' : 'Добавить канал'}</h3>
                <form onSubmit={handleChSave}>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                    <label style={{fontSize: 12, color: '#9aa4b2'}}>Название *
                      <input className="input" value={chForm.name} onChange={e => setChForm({...chForm, name: e.target.value})} placeholder="Мой Telegram" style={{marginTop: 4, width: '100%'}} />
                    </label>
                    {!editCh && (
                      <div>
                        <div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 6}}>Тип канала</div>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8}}>
                          {CHANNEL_TYPES.map(ct => (
                            <button key={ct.value} type="button" onClick={() => setChForm({...chForm, channel_type: ct.value, config: {}})} style={{
                              padding: '10px 6px', borderRadius: 8, border: `2px solid ${chForm.channel_type === ct.value ? ct.color : '#1a2940'}`,
                              background: chForm.channel_type === ct.value ? ct.color + '20' : '#0d1b2a', color: '#fff', cursor: 'pointer', fontSize: 11, textAlign: 'center'
                            }}>
                              <div style={{fontSize: 18}}>{ct.icon}</div><div style={{marginTop: 2}}>{ct.label}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{padding: 14, background: '#0a1628', borderRadius: 8, border: '1px solid #1a2940'}}>
                      <div style={{fontSize: 13, fontWeight: 600, marginBottom: 10}}>Настройки {CHANNEL_TYPES.find(c => c.value === chForm.channel_type)?.label}</div>
                      <ConfigForm type={chForm.channel_type} config={chForm.config} onChange={config => setChForm({...chForm, config})} />
                    </div>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
                      <label style={{fontSize: 12, color: '#9aa4b2'}}>Фильтр серьезности
                        <select className="input" value={chForm.severity_filter} onChange={e => setChForm({...chForm, severity_filter: e.target.value})} style={{marginTop: 4, width: '100%'}}>
                          {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </label>
                      <label style={{fontSize: 12, color: '#9aa4b2'}}>Фильтр категории
                        <select className="input" value={chForm.category_filter} onChange={e => setChForm({...chForm, category_filter: e.target.value})} style={{marginTop: 4, width: '100%'}}>
                          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </label>
                    </div>
                    {chFormError && <div style={{color: '#ef4444', fontSize: 13}}>{chFormError}</div>}
                    <div style={{display: 'flex', gap: 10, justifyContent: 'flex-end'}}>
                      <button type="button" className="btn" onClick={() => setShowChAdd(false)} style={{background: '#1a2940', color: '#9aa4b2'}}>Отмена</button>
                      <button type="submit" className="btn btn-primary" disabled={chSaving}>{chSaving ? 'Сохранение...' : editCh ? 'Сохранить' : 'Создать'}</button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ============ RULE WIZARD MODAL ============ */}
          {showRuleWizard && (
            <div style={{position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16}} onClick={() => setShowRuleWizard(false)}>
              <div className="card" style={{width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto', padding: 0}} onClick={e => e.stopPropagation()}>
                <div style={{padding: '20px 24px 0'}}>
                  <h3 style={{margin: '0 0 16px'}}>{editRule ? 'Редактировать правило' : 'Создать правило уведомления'}</h3>
                  <div style={{display: 'flex', gap: 0, marginBottom: 0}}>
                    {WIZARD_STEPS.map((s, i) => (
                      <button key={i} type="button" onClick={() => setWizardStep(i)} style={{
                        flex: 1, padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer',
                        borderBottom: `3px solid ${i === wizardStep ? '#00d4ff' : i < wizardStep ? '#4ade80' : '#1a2940'}`,
                        color: i === wizardStep ? '#00d4ff' : i < wizardStep ? '#4ade80' : '#6b7280', fontSize: 12, fontWeight: 600, transition: 'all 0.2s'
                      }}>
                        <span style={{display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', fontSize: 10, marginRight: 4,
                          background: i < wizardStep ? '#4ade80' : i === wizardStep ? '#00d4ff' : '#1a2940', color: i <= wizardStep ? '#000' : '#6b7280'
                        }}>{i < wizardStep ? '✓' : i + 1}</span>{s}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{padding: '20px 24px 24px'}}>
                  {wizardStep === 0 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                      <label style={{fontSize: 12, color: '#9aa4b2'}}>Название правила *
                        <input className="input" value={ruleForm.name} onChange={e => setRuleForm({...ruleForm, name: e.target.value})} placeholder="CPU сервера > 90%" style={{marginTop: 4, width: '100%'}} />
                      </label>
                      <div><div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 6}}>Организация</div>
                        <select className="input" value={ruleForm.org_id || ''} onChange={e => setRuleForm({...ruleForm, org_id: e.target.value ? parseInt(e.target.value) : null, target_id: ''})} style={{width: '100%'}}>
                          <option value="">Все организации</option>
                          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                      <div><div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 8}}>Тип ресурса</div>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8}}>
                          {TARGET_TYPES.map(tt => (
                            <button key={tt.value} type="button" onClick={() => setRuleForm({...ruleForm, target_type: tt.value, target_id: ''})} style={{
                              padding: '12px 8px', borderRadius: 10, border: `2px solid ${ruleForm.target_type === tt.value ? '#00d4ff' : '#1a2940'}`,
                              background: ruleForm.target_type === tt.value ? '#00d4ff15' : '#0d1b2a', color: '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s'
                            }}><div style={{fontSize: 22}}>{tt.icon}</div><div style={{fontSize: 12, marginTop: 4}}>{tt.label}</div></button>
                          ))}
                        </div>
                      </div>
                      {ruleForm.target_type && (
                        <div><div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 6}}>Конкретный ресурс</div>
                          <select className="input" value={ruleForm.target_id || ''} onChange={e => setRuleForm({...ruleForm, target_id: e.target.value})} style={{width: '100%'}}>
                            <option value="">Все {TARGET_TYPES.find(t => t.value === ruleForm.target_type)?.label?.toLowerCase()}</option>
                            {filteredTargets.map(t => <option key={t.id} value={t.id}>{t.name}{t.host ? ` (${t.host})` : ''}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                  {wizardStep === 1 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                      <div><div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 8}}>Метрика</div>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6}}>
                          {availableMetrics.map(m => (
                            <button key={m.value} type="button" onClick={() => setRuleForm({...ruleForm, metric: m.value})} style={{
                              padding: '10px 8px', borderRadius: 8, border: `2px solid ${ruleForm.metric === m.value ? '#00d4ff' : '#1a2940'}`,
                              background: ruleForm.metric === m.value ? '#00d4ff15' : '#0d1b2a', color: '#fff', cursor: 'pointer',
                              textAlign: 'left', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s'
                            }}><span style={{fontSize: 16}}>{m.icon}</span> {m.label}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
                        <div><div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 6}}>Условие</div>
                          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6}}>
                            {CONDITIONS.map(c => (
                              <button key={c.value} type="button" onClick={() => setRuleForm({...ruleForm, condition: c.value})} style={{
                                padding: '8px', borderRadius: 6, border: `2px solid ${ruleForm.condition === c.value ? '#00d4ff' : '#1a2940'}`,
                                background: ruleForm.condition === c.value ? '#00d4ff15' : '#0d1b2a', color: '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'center'
                              }}><span style={{fontSize: 16, fontWeight: 700}}>{c.short}</span><div style={{fontSize: 10, color: '#6b7280', marginTop: 2}}>{c.label.split('(')[0].trim()}</div></button>
                            ))}
                          </div>
                        </div>
                        <div><div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 6}}>Пороговое значение</div>
                          <div style={{position: 'relative'}}>
                            <input className="input" type="number" value={ruleForm.threshold_value} onChange={e => setRuleForm({...ruleForm, threshold_value: e.target.value})} style={{width: '100%', paddingRight: 40, fontSize: 18, fontWeight: 700, textAlign: 'center', height: 52}} />
                            <span style={{position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontSize: 13}}>{METRICS.find(m => m.value === ruleForm.metric)?.unit || ''}</span>
                          </div>
                        </div>
                      </div>
                      <div><div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 8}}>Серьезность при срабатывании</div>
                        <div style={{display: 'flex', gap: 8}}>
                          {[{v: 'critical', l: 'Critical', c: '#ef4444'}, {v: 'warning', l: 'Warning', c: '#f59e0b'}, {v: 'info', l: 'Info', c: '#3b82f6'}].map(s => (
                            <button key={s.v} type="button" onClick={() => setRuleForm({...ruleForm, severity: s.v})} style={{
                              flex: 1, padding: '10px', borderRadius: 8, border: `2px solid ${ruleForm.severity === s.v ? s.c : '#1a2940'}`,
                              background: ruleForm.severity === s.v ? s.c + '20' : '#0d1b2a', color: s.c, cursor: 'pointer', fontWeight: 700, fontSize: 13, textAlign: 'center'
                            }}>{s.l}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {wizardStep === 2 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                      <div><div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 8}}>Канал уведомления</div>
                        {channels.length === 0 ? (
                          <div style={{padding: 16, background: '#f59e0b10', border: '1px solid #f59e0b40', borderRadius: 8, fontSize: 13, color: '#f59e0b'}}>
                            ⚠️ Нет настроенных каналов. <button onClick={() => {setShowRuleWizard(false); setTab('channels'); setTimeout(openChAdd, 100)}} style={{background: 'none', border: 'none', color: '#00d4ff', cursor: 'pointer', textDecoration: 'underline', fontSize: 13}}>Добавить канал</button>
                          </div>
                        ) : (
                          <div style={{display: 'grid', gap: 8}}>
                            <button type="button" onClick={() => setRuleForm({...ruleForm, channel_id: null})} style={{
                              padding: '12px', borderRadius: 8, border: `2px solid ${!ruleForm.channel_id ? '#00d4ff' : '#1a2940'}`,
                              background: !ruleForm.channel_id ? '#00d4ff15' : '#0d1b2a', color: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: 13
                            }}><span style={{fontWeight: 600}}>📡 Все каналы</span><span style={{fontSize: 11, color: '#6b7280', marginLeft: 8}}>Отправить на все активные каналы</span></button>
                            {channels.filter(c => c.is_enabled).map(ch => {
                              const ct = CHANNEL_TYPES.find(c => c.value === ch.channel_type)
                              return (
                                <button key={ch.id} type="button" onClick={() => setRuleForm({...ruleForm, channel_id: ch.id})} style={{
                                  padding: '12px', borderRadius: 8, border: `2px solid ${ruleForm.channel_id === ch.id ? '#00d4ff' : '#1a2940'}`,
                                  background: ruleForm.channel_id === ch.id ? '#00d4ff15' : '#0d1b2a', color: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: 13,
                                  display: 'flex', alignItems: 'center', gap: 10
                                }}><span style={{fontSize: 18}}>{ct?.icon || '🔔'}</span><div><span style={{fontWeight: 600}}>{ch.name}</span><span style={{fontSize: 10, marginLeft: 6, padding: '1px 6px', borderRadius: 4, background: (ct?.color || '#666') + '30', color: ct?.color || '#999'}}>{ct?.label}</span></div></button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                      <div><div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 8}}>Интервал повторения (cooldown)</div>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6}}>
                          {COOLDOWNS.map(cd => (
                            <button key={cd.value} type="button" onClick={() => setRuleForm({...ruleForm, cooldown: cd.value})} style={{
                              padding: '8px', borderRadius: 6, border: `2px solid ${ruleForm.cooldown === cd.value ? '#00d4ff' : '#1a2940'}`,
                              background: ruleForm.cooldown === cd.value ? '#00d4ff15' : '#0d1b2a', color: '#fff', cursor: 'pointer', fontSize: 12, textAlign: 'center'
                            }}>{cd.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {wizardStep === 3 && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
                      <div style={{padding: 16, background: '#0a1628', borderRadius: 10, border: '1px solid #1a2940'}}>
                        <div style={{fontSize: 16, fontWeight: 700, marginBottom: 12}}>{ruleForm.name || 'Без названия'}</div>
                        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13}}>
                          <div><span style={{color: '#6b7280'}}>Организация:</span> <span style={{color: '#fff'}}>{ruleForm.org_id ? orgs.find(o => o.id === ruleForm.org_id)?.name || '—' : 'Все'}</span></div>
                          <div><span style={{color: '#6b7280'}}>Тип ресурса:</span> <span style={{color: '#fff'}}>{TARGET_TYPES.find(t => t.value === ruleForm.target_type)?.label || 'Все'}</span></div>
                          <div><span style={{color: '#6b7280'}}>Ресурс:</span> <span style={{color: '#fff'}}>{ruleForm.target_id ? filteredTargets.find(t => String(t.id) === String(ruleForm.target_id))?.name || ruleForm.target_id : 'Все'}</span></div>
                          <div><span style={{color: '#6b7280'}}>Метрика:</span> <span style={{color: '#fff'}}>{METRICS.find(m => m.value === ruleForm.metric)?.icon} {METRICS.find(m => m.value === ruleForm.metric)?.label || ruleForm.metric}</span></div>
                          <div><span style={{color: '#6b7280'}}>Условие:</span> <span style={{color: '#fff', fontWeight: 600, fontSize: 15}}>{CONDITIONS.find(c => c.value === ruleForm.condition)?.short} {ruleForm.threshold_value}{METRICS.find(m => m.value === ruleForm.metric)?.unit || ''}</span></div>
                          <div><span style={{color: '#6b7280'}}>Серьезность:</span> <span style={{color: {critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6'}[ruleForm.severity], fontWeight: 600, textTransform: 'uppercase'}}>{ruleForm.severity}</span></div>
                          <div><span style={{color: '#6b7280'}}>Канал:</span> <span style={{color: '#fff'}}>{ruleForm.channel_id ? channels.find(c => c.id === ruleForm.channel_id)?.name || '—' : 'Все каналы'}</span></div>
                          <div><span style={{color: '#6b7280'}}>Cooldown:</span> <span style={{color: '#fff'}}>{COOLDOWNS.find(c => c.value === ruleForm.cooldown)?.label || ruleForm.cooldown + 'с'}</span></div>
                        </div>
                      </div>
                      {rFormError && <div style={{color: '#ef4444', fontSize: 13}}>{rFormError}</div>}
                    </div>
                  )}
                  <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 10}}>
                    <button type="button" className="btn" onClick={() => wizardStep > 0 ? setWizardStep(wizardStep - 1) : setShowRuleWizard(false)} style={{background: '#1a2940', color: '#9aa4b2'}}>{wizardStep > 0 ? '← Назад' : 'Отмена'}</button>
                    {wizardStep < 3 ? (
                      <button type="button" className="btn btn-primary" onClick={() => { if (wizardStep === 0 && !ruleForm.name.trim()) { setRFormError('Укажите название'); return } setRFormError(null); setWizardStep(wizardStep + 1) }}>Далее →</button>
                    ) : (
                      <button type="button" className="btn btn-primary" disabled={rSaving} onClick={handleRuleSave}>{rSaving ? 'Сохранение...' : editRule ? '💾 Сохранить' : '✓ Создать правило'}</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ TELEGRAM USER EDIT MODAL ============ */}
          {editTgUser && (
            <div style={{position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16}} onClick={() => setEditTgUser(null)}>
              <div className="card" style={{width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', padding: 24}} onClick={e => e.stopPropagation()}>
                <h3 style={{marginTop: 0}}>⚙️ Настройка пользователя</h3>
                <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: 12, background: '#0a1628', borderRadius: 8, border: '1px solid #1a2940'}}>
                  <span style={{fontSize: 28}}>👤</span>
                  <div>
                    <div style={{fontWeight: 600}}>{editTgUser.first_name || 'Без имени'}{editTgUser.last_name ? ` ${editTgUser.last_name}` : ''}</div>
                    <div style={{fontSize: 12, color: '#229ED9'}}>{editTgUser.username ? `@${editTgUser.username}` : `ID: ${editTgUser.telegram_id}`}</div>
                  </div>
                </div>

                <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
                  {/* Organization */}
                  <div>
                    <div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 6}}>🏢 Организация</div>
                    <select className="input" value={tgUserForm.org_id || ''} onChange={e => setTgUserForm({...tgUserForm, org_id: e.target.value ? parseInt(e.target.value) : null})} style={{width: '100%'}}>
                      <option value="">Не назначена</option>
                      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    {orgs.length === 0 && (
                      <div style={{fontSize: 11, color: '#f59e0b', marginTop: 6, padding: '6px 8px', background: '#f59e0b10', borderRadius: 4, border: '1px solid #f59e0b30'}}>
                        ⚠️ Нет организаций. <a href="/organizations" style={{color: '#00d4ff', textDecoration: 'underline'}}>Создайте организацию</a> чтобы привязать пользователя.
                      </div>
                    )}
                    <div style={{fontSize: 11, color: '#4b5563', marginTop: 4}}>Пользователь будет получать уведомления только по ресурсам этой организации</div>
                  </div>

                  {/* Severity toggles */}
                  <div>
                    <div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 8}}>🔔 Уровни серьезности</div>
                    <div style={{display: 'flex', gap: 8}}>
                      {[
                        {key: 'notify_critical', label: 'Critical', color: '#ef4444'},
                        {key: 'notify_warning', label: 'Warning', color: '#f59e0b'},
                        {key: 'notify_info', label: 'Info', color: '#3b82f6'},
                      ].map(s => (
                        <button key={s.key} type="button" onClick={() => setTgUserForm({...tgUserForm, [s.key]: !tgUserForm[s.key]})} style={{
                          flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, textAlign: 'center', transition: 'all 0.2s',
                          border: `2px solid ${tgUserForm[s.key] ? s.color : '#1a2940'}`,
                          background: tgUserForm[s.key] ? s.color + '20' : '#0d1b2a',
                          color: tgUserForm[s.key] ? s.color : '#4b5563',
                        }}>
                          {tgUserForm[s.key] ? '✓' : '✗'} {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category filter */}
                  <div>
                    <div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 8}}>📂 Категории уведомлений</div>
                    <div style={{fontSize: 11, color: '#4b5563', marginBottom: 8}}>Оставьте пустым для получения всех категорий</div>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6}}>
                      {ALL_CATEGORIES.map(cat => {
                        const active = (tgUserForm.notify_categories || []).includes(cat.value)
                        return (
                          <button key={cat.value} type="button" onClick={() => {
                            const cats = tgUserForm.notify_categories || []
                            setTgUserForm({...tgUserForm, notify_categories: active ? cats.filter(c => c !== cat.value) : [...cats, cat.value]})
                          }} style={{
                            padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, textAlign: 'center', transition: 'all 0.2s',
                            border: `2px solid ${active ? '#00d4ff' : '#1a2940'}`,
                            background: active ? '#00d4ff15' : '#0d1b2a', color: active ? '#00d4ff' : '#6b7280',
                          }}>{active ? '✓' : '○'} {cat.label}</button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8}}>
                    <button type="button" className="btn" onClick={() => setEditTgUser(null)} style={{background: '#1a2940', color: '#9aa4b2'}}>Отмена</button>
                    <button type="button" className="btn btn-primary" disabled={tgUserSaving} onClick={handleTgUserSave}>{tgUserSaving ? 'Сохранение...' : '💾 Сохранить'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ ADD TELEGRAM USER MODAL ============ */}
          {showAddTgUser && (
            <div style={{position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16}} onClick={() => setShowAddTgUser(false)}>
              <div className="card" style={{width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', padding: 24}} onClick={e => e.stopPropagation()}>
                <h3 style={{marginTop: 0}}>➕ Добавить пользователя</h3>
                {addTgUserError && <div style={{background: '#ef444420', border: '1px solid #ef4444', color: '#ef4444', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13}}>{addTgUserError}</div>}
                <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
                  <label style={{fontSize: 12, color: '#9aa4b2'}}>Telegram ID *
                    <input className="input" value={addTgUserForm.telegram_id} onChange={e => setAddTgUserForm({...addTgUserForm, telegram_id: e.target.value})} placeholder="Например: 123456789" style={{marginTop: 4, width: '100%'}} />
                    <div style={{fontSize: 11, color: '#4b5563', marginTop: 4}}>Числовой ID пользователя в Telegram (можно узнать через @userinfobot)</div>
                  </label>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
                    <label style={{fontSize: 12, color: '#9aa4b2'}}>Имя
                      <input className="input" value={addTgUserForm.first_name} onChange={e => setAddTgUserForm({...addTgUserForm, first_name: e.target.value})} placeholder="Имя" style={{marginTop: 4, width: '100%'}} />
                    </label>
                    <label style={{fontSize: 12, color: '#9aa4b2'}}>Фамилия
                      <input className="input" value={addTgUserForm.last_name} onChange={e => setAddTgUserForm({...addTgUserForm, last_name: e.target.value})} placeholder="Фамилия" style={{marginTop: 4, width: '100%'}} />
                    </label>
                  </div>
                  <label style={{fontSize: 12, color: '#9aa4b2'}}>Username
                    <input className="input" value={addTgUserForm.username} onChange={e => setAddTgUserForm({...addTgUserForm, username: e.target.value})} placeholder="@username (без @)" style={{marginTop: 4, width: '100%'}} />
                  </label>
                  <div>
                    <div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 6}}>🏢 Организация</div>
                    <select className="input" value={addTgUserForm.org_id || ''} onChange={e => setAddTgUserForm({...addTgUserForm, org_id: e.target.value ? parseInt(e.target.value) : null})} style={{width: '100%'}}>
                      <option value="">Не назначена</option>
                      {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 8}}>🔔 Уровни серьезности</div>
                    <div style={{display: 'flex', gap: 8}}>
                      {[
                        {key: 'notify_critical', label: 'Critical', color: '#ef4444'},
                        {key: 'notify_warning', label: 'Warning', color: '#f59e0b'},
                        {key: 'notify_info', label: 'Info', color: '#3b82f6'},
                      ].map(s => (
                        <button key={s.key} type="button" onClick={() => setAddTgUserForm({...addTgUserForm, [s.key]: !addTgUserForm[s.key]})} style={{
                          flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, textAlign: 'center', transition: 'all 0.2s',
                          border: `2px solid ${addTgUserForm[s.key] ? s.color : '#1a2940'}`,
                          background: addTgUserForm[s.key] ? s.color + '20' : '#0d1b2a',
                          color: addTgUserForm[s.key] ? s.color : '#4b5563',
                        }}>
                          {addTgUserForm[s.key] ? '✓' : '✗'} {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize: 12, color: '#9aa4b2', marginBottom: 8}}>📂 Категории уведомлений</div>
                    <div style={{fontSize: 11, color: '#4b5563', marginBottom: 8}}>Оставьте пустым для получения всех категорий</div>
                    <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6}}>
                      {ALL_CATEGORIES.map(cat => {
                        const active = (addTgUserForm.notify_categories || []).includes(cat.value)
                        return (
                          <button key={cat.value} type="button" onClick={() => {
                            const cats = addTgUserForm.notify_categories || []
                            setAddTgUserForm({...addTgUserForm, notify_categories: active ? cats.filter(c => c !== cat.value) : [...cats, cat.value]})
                          }} style={{
                            padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 12, textAlign: 'center', transition: 'all 0.2s',
                            border: `2px solid ${active ? '#00d4ff' : '#1a2940'}`,
                            background: active ? '#00d4ff15' : '#0d1b2a', color: active ? '#00d4ff' : '#6b7280',
                          }}>{active ? '✓' : '○'} {cat.label}</button>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8}}>
                    <button type="button" className="btn" onClick={() => setShowAddTgUser(false)} style={{background: '#1a2940', color: '#9aa4b2'}}>Отмена</button>
                    <button type="button" className="btn btn-primary" disabled={addTgUserSaving} onClick={handleAddTgUser}>{addTgUserSaving ? 'Сохранение...' : '➕ Добавить'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ TELEGRAM SEND MESSAGE MODAL ============ */}
          {tgSendModal && (
            <div style={{position: 'fixed', inset: 0, background: '#000a', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16}} onClick={() => setTgSendModal(null)}>
              <div className="card" style={{width: '100%', maxWidth: 440, padding: 24}} onClick={e => e.stopPropagation()}>
                <h3 style={{marginTop: 0}}>💬 Отправить сообщение</h3>
                <div style={{fontSize: 13, color: '#9aa4b2', marginBottom: 12}}>
                  Кому: <b style={{color: '#fff'}}>{tgSendModal.first_name || tgSendModal.username || tgSendModal.telegram_id}</b>
                </div>
                <textarea className="input" rows={4} value={tgSendMsg} onChange={e => setTgSendMsg(e.target.value)} placeholder="Введите сообщение..." style={{width: '100%', marginBottom: 12}} />
                {tgSendResult && (
                  <div style={{fontSize: 12, marginBottom: 12, padding: '6px 10px', borderRadius: 4, background: tgSendResult.sent ? '#4ade8020' : '#ef444420', color: tgSendResult.sent ? '#4ade80' : '#ef4444'}}>
                    {tgSendResult.sent ? '✓ Сообщение отправлено!' : `✗ ${tgSendResult.error || 'Ошибка'}`}
                  </div>
                )}
                <div style={{display: 'flex', gap: 10, justifyContent: 'flex-end'}}>
                  <button type="button" className="btn" onClick={() => setTgSendModal(null)} style={{background: '#1a2940', color: '#9aa4b2'}}>Закрыть</button>
                  <button type="button" className="btn btn-primary" disabled={tgSending || !tgSendMsg.trim()} onClick={handleTgSend}>{tgSending ? 'Отправка...' : '📤 Отправить'}</button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </ProtectedRoute>
  )
}
