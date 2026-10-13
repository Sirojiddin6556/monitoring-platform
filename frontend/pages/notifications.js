import { useEffect, useState, useCallback } from 'react'
import Sidebar from '../components/Sidebar'
import ProtectedRoute from '../components/ProtectedRoute'
import apiFetch from '../lib/api'
import {
  Bell,
  Send,
  Mail,
  Webhook,
  MessageSquare,
  Server,
  Globe,
  Cpu,
  Layers,
  HardDrive,
  RefreshCw,
  Radio,
  CheckCircle2,
  XCircle,
  Clock,
  Lock,
  Hash,
  AlertTriangle,
  Settings,
  Boxes,
  Plus,
  Trash2,
  Edit2,
  Play,
  Pause,
  FlaskConical,
  Building2,
  Users,
  Search,
  Check,
  X,
  ChevronRight,
  Shield,
  Sliders,
  ExternalLink,
  Info
} from 'lucide-react'

const CHANNEL_TYPES = [
  { value: 'telegram', label: 'Telegram', icon: Send, color: '#38bdf8' },
  { value: 'email', label: 'Email (SMTP)', icon: Mail, color: '#f87171' },
  { value: 'webhook', label: 'Webhook', icon: Webhook, color: '#a855f7' },
  { value: 'discord', label: 'Discord', icon: MessageSquare, color: '#818cf8' },
]

const SEVERITIES = [
  { value: 'all', label: 'Все уровни' },
  { value: 'critical', label: 'Critical' },
  { value: 'warning', label: 'Warning' },
  { value: 'info', label: 'Info' },
]

const CATEGORIES = [
  { value: 'all', label: 'Все категории' },
  { value: 'system', label: 'Система' },
  { value: 'website', label: 'Веб-сайты' },
  { value: 'service', label: 'Сервисы' },
  { value: 'docker', label: 'Docker' },
  { value: 'security', label: 'Безопасность' },
]

const ALL_CATEGORIES = [
  { value: 'system', label: 'Система' },
  { value: 'website', label: 'Веб-сайты' },
  { value: 'service', label: 'Сервисы' },
  { value: 'docker', label: 'Docker' },
  { value: 'security', label: 'Безопасность' },
]

const TARGET_TYPES = [
  { value: '', label: 'Все ресурсы', icon: Globe },
  { value: 'server', label: 'Серверы', icon: Server },
  { value: 'website', label: 'Веб-сайты', icon: Globe },
  { value: 'hypervisor', label: 'Виртуальные машины', icon: Cpu },
]

const METRICS = [
  { value: 'any', label: 'Любая метрика', icon: Layers, group: 'general', unit: '' },
  { value: 'cpu', label: 'CPU (процессор)', icon: Cpu, group: 'server', unit: '%' },
  { value: 'ram', label: 'RAM (память)', icon: Layers, group: 'server', unit: '%' },
  { value: 'disk', label: 'Диск', icon: HardDrive, group: 'server', unit: '%' },
  { value: 'swap', label: 'Swap (подкачка)', icon: RefreshCw, group: 'server', unit: '%' },
  { value: 'ping', label: 'Ping (задержка)', icon: Radio, group: 'server', unit: 'мс' },
  { value: 'availability', label: 'Доступность', icon: CheckCircle2, group: 'server', unit: '' },
  { value: 'response_time', label: 'Время ответа', icon: Clock, group: 'website', unit: 'мс' },
  { value: 'ssl_expiry', label: 'SSL-сертификат', icon: Lock, group: 'website', unit: 'дней' },
  { value: 'status_code', label: 'HTTP статус', icon: Hash, group: 'website', unit: '' },
  { value: 'zombie_processes', label: 'Zombie-процессы', icon: AlertTriangle, group: 'server', unit: '' },
  { value: 'service_status', label: 'Статус сервиса', icon: Settings, group: 'server', unit: '' },
  { value: 'container_status', label: 'Статус контейнера', icon: Boxes, group: 'server', unit: '' },
]

const CONDITIONS = [
  { value: 'gt', label: 'Больше чем (>)', short: '>' },
  { value: 'lt', label: 'Меньше чем (<)', short: '<' },
  { value: 'eq', label: 'Равно (=)', short: '=' },
  { value: 'neq', label: 'Не равно (≠)', short: '≠' },
]

const COOLDOWNS = [
  { value: 0, label: 'Без задержки' },
  { value: 60, label: '1 минута' },
  { value: 300, label: '5 минут' },
  { value: 600, label: '10 минут' },
  { value: 1800, label: '30 минут' },
  { value: 3600, label: '1 час' },
]

function ConfigForm({ type, config, onChange }) {
  const update = (key, val) => onChange({ ...config, [key]: val })
  if (type === 'telegram') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            Bot Token (из @BotFather) <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            value={config.bot_token || ''}
            onChange={e => update('bot_token', e.target.value)}
            placeholder="123456789:ABCdefGHIjklmnop..."
            type="password"
            style={modernInputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            Chat ID <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            value={config.chat_id || ''}
            onChange={e => update('chat_id', e.target.value)}
            placeholder="-1001234567890"
            style={modernInputStyle}
          />
        </div>
      </div>
    )
  }
  if (type === 'email') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
              SMTP Host <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              value={config.smtp_host || ''}
              onChange={e => update('smtp_host', e.target.value)}
              placeholder="smtp.example.com"
              style={modernInputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>SMTP Port</label>
            <input
              type="number"
              value={config.smtp_port || 587}
              onChange={e => update('smtp_port', parseInt(e.target.value) || 587)}
              style={modernInputStyle}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>SMTP User</label>
            <input
              value={config.smtp_user || ''}
              onChange={e => update('smtp_user', e.target.value)}
              placeholder="alerts@example.com"
              style={modernInputStyle}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>SMTP Password</label>
            <input
              type="password"
              value={config.smtp_password || ''}
              onChange={e => update('smtp_password', e.target.value)}
              style={modernInputStyle}
            />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>From Email</label>
          <input
            value={config.from_email || ''}
            onChange={e => update('from_email', e.target.value)}
            placeholder="noreply@example.com"
            style={modernInputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            To Emails (через запятую) <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            value={(config.to_emails || []).join(', ')}
            onChange={e =>
              update(
                'to_emails',
                e.target.value
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder="admin@example.com, ops@example.com"
            style={modernInputStyle}
          />
        </div>
        <label style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={config.use_tls !== false}
            onChange={e => update('use_tls', e.target.checked)}
          />
          Использовать TLS шифрование
        </label>
      </div>
    )
  }
  if (type === 'webhook') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            Webhook URL <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            value={config.url || ''}
            onChange={e => update('url', e.target.value)}
            placeholder="https://example.com/api/webhook"
            style={modernInputStyle}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Custom Headers (JSON)</label>
          <textarea
            rows={3}
            value={config.headers ? JSON.stringify(config.headers, null, 2) : ''}
            onChange={e => {
              try {
                update('headers', JSON.parse(e.target.value))
              } catch {}
            }}
            placeholder='{"Authorization": "Bearer token"}'
            style={{ ...modernInputStyle, fontFamily: 'monospace', fontSize: 12 }}
          />
        </div>
      </div>
    )
  }
  if (type === 'discord') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
            Discord Webhook URL <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <input
            value={config.webhook_url || ''}
            onChange={e => update('webhook_url', e.target.value)}
            placeholder="https://discord.com/api/webhooks/..."
            style={modernInputStyle}
          />
        </div>
      </div>
    )
  }
  return null
}

export default function Notifications() {
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState('rules')

  // Channels state
  const [channels, setChannels] = useState([])
  const [chLoading, setChLoading] = useState(true)
  const [chError, setChError] = useState(null)
  const [showChAdd, setShowChAdd] = useState(false)
  const [editCh, setEditCh] = useState(null)
  const [chForm, setChForm] = useState({
    name: '',
    channel_type: 'telegram',
    config: {},
    severity_filter: 'all',
    category_filter: 'all'
  })
  const [chFormError, setChFormError] = useState(null)
  const [chSaving, setChSaving] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testingId, setTestingId] = useState(null)

  // Filter for channel types
  const getChannelsByType = types => channels.filter(ch => types.includes(ch.channel_type))
  const emailWebhookChannels = getChannelsByType(['email', 'webhook'])
  const messengerChannels = getChannelsByType(['telegram', 'discord'])

  // Rules state
  const [rules, setRules] = useState([])
  const [rLoading, setRLoading] = useState(true)
  const [rError, setRError] = useState(null)
  const [showRuleWizard, setShowRuleWizard] = useState(false)
  const [editRule, setEditRule] = useState(null)
  const [wizardStep, setWizardStep] = useState(0)
  const [ruleForm, setRuleForm] = useState({
    name: '',
    org_id: null,
    target_type: '',
    target_id: '',
    metric: 'cpu',
    condition: 'gt',
    threshold_value: '80',
    severity: 'warning',
    channel_id: null,
    cooldown: 300
  })
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
  const [tgUserForm, setTgUserForm] = useState({
    org_id: null,
    notify_critical: true,
    notify_warning: true,
    notify_info: false,
    notify_categories: []
  })
  const [tgUserSaving, setTgUserSaving] = useState(false)
  const [tgSendModal, setTgSendModal] = useState(null)
  const [tgSendMsg, setTgSendMsg] = useState('')
  const [tgSending, setTgSending] = useState(false)
  const [tgSendResult, setTgSendResult] = useState(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [importingUsers, setImportingUsers] = useState(false)
  const [showAddTgUser, setShowAddTgUser] = useState(false)
  const [addTgUserForm, setAddTgUserForm] = useState({
    telegram_id: '',
    username: '',
    first_name: '',
    last_name: '',
    org_id: null,
    notify_critical: true,
    notify_warning: true,
    notify_info: false,
    notify_categories: []
  })
  const [addTgUserError, setAddTgUserError] = useState(null)
  const [addTgUserSaving, setAddTgUserSaving] = useState(false)

  // Data for selectors
  const [orgs, setOrgs] = useState([])
  const [servers, setServers] = useState([])
  const [websites, setWebsites] = useState([])
  const [hypervisors, setHypervisors] = useState([])

  useEffect(() => {
    setMounted(true)
  }, [])

  const loadChannels = useCallback(async () => {
    try {
      setChError(null)
      const d = await apiFetch('/api/notifications/channels')
      setChannels(d.channels || [])
    } catch (err) {
      setChError(err.message)
    } finally {
      setChLoading(false)
    }
  }, [])

  const loadRules = useCallback(async () => {
    try {
      setRError(null)
      const d = await apiFetch('/api/notifications/rules')
      setRules(d.rules || [])
    } catch (err) {
      setRError(err.message)
    } finally {
      setRLoading(false)
    }
  }, [])

  const loadBots = useCallback(async () => {
    try {
      setTgError(null)
      const d = await apiFetch('/api/telegram/bots')
      const bList = d.bots || []
      setBots(bList)
      if (bList.length > 0 && !selectedBot) {
        setSelectedBot(bList[0])
      }
    } catch (err) {
      setTgError(err.message)
    } finally {
      setTgLoading(false)
    }
  }, [selectedBot])

  const loadBotUsers = useCallback(async botId => {
    if (!botId) return
    setBotUsersLoading(true)
    try {
      const d = await apiFetch(`/api/telegram/bots/${botId}/users`)
      setBotUsers(d.users || [])
    } catch {
    } finally {
      setBotUsersLoading(false)
    }
  }, [])

  const loadResources = useCallback(async () => {
    try {
      const [orgData, srvData, wsData] = await Promise.all([
        apiFetch('/api/organizations'),
        apiFetch('/api/servers'),
        apiFetch('/api/websites')
      ])
      setOrgs(orgData.organizations || [])
      setServers(srvData.servers || [])
      setWebsites(wsData.websites || [])
      try {
        const hvData = await apiFetch('/api/vm/hypervisors')
        setHypervisors(hvData.hypervisors || [])
      } catch {
        setHypervisors([])
      }
    } catch {}
  }, [])

  useEffect(() => {
    loadChannels()
    loadRules()
    loadBots()
    loadResources()
  }, [loadChannels, loadRules, loadBots, loadResources])

  useEffect(() => {
    if (selectedBot) loadBotUsers(selectedBot.id)
  }, [selectedBot, loadBotUsers])

  useEffect(() => {
    if (tab === 'telegram' && selectedBot) loadBotUsers(selectedBot.id)
  }, [tab, selectedBot, loadBotUsers])

  // Channel handlers
  function openChAdd() {
    setEditCh(null)
    const defaultType = tab === 'emailWebhook' ? 'email' : 'telegram'
    setChForm({
      name: '',
      channel_type: defaultType,
      config: {},
      severity_filter: 'all',
      category_filter: 'all'
    })
    setChFormError(null)
    setShowChAdd(true)
  }

  function openChEdit(ch) {
    setEditCh(ch)
    setChForm({
      name: ch.name,
      channel_type: ch.channel_type,
      config: { ...ch.config },
      severity_filter: ch.severity_filter,
      category_filter: ch.category_filter
    })
    setChFormError(null)
    setShowChAdd(true)
  }

  async function handleChSave(e) {
    e.preventDefault()
    setChFormError(null)
    if (!chForm.name.trim()) {
      setChFormError('Название обязательно')
      return
    }
    setChSaving(true)
    try {
      if (editCh) {
        await apiFetch(`/api/notifications/channels/${editCh.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: chForm.name,
            config: chForm.config,
            severity_filter: chForm.severity_filter,
            category_filter: chForm.category_filter
          })
        })
      } else {
        await apiFetch('/api/notifications/channels', { method: 'POST', body: JSON.stringify(chForm) })
      }
      setShowChAdd(false)
      await loadChannels()
    } catch (err) {
      setChFormError(err.message || 'Ошибка сохранения')
    } finally {
      setChSaving(false)
    }
  }

  async function handleChDelete(id) {
    if (!confirm('Удалить канал уведомлений?')) return
    try {
      await apiFetch(`/api/notifications/channels/${id}`, { method: 'DELETE' })
      await loadChannels()
    } catch {
      setChError('Ошибка удаления')
    }
  }

  async function handleChToggle(id) {
    try {
      await apiFetch(`/api/notifications/channels/${id}/toggle`, { method: 'POST' })
      await loadChannels()
    } catch {
      setChError('Ошибка')
    }
  }

  async function handleChTest(id) {
    setTestingId(id)
    setTestResult(null)
    try {
      const res = await apiFetch(`/api/notifications/channels/${id}/test`, { method: 'POST' })
      setTestResult({ id, ...res })
    } catch (err) {
      setTestResult({ id, success: false, message: err.message })
    } finally {
      setTestingId(null)
    }
  }

  // Rule handlers
  function openRuleWizard() {
    setEditRule(null)
    setWizardStep(0)
    setRuleForm({
      name: '',
      org_id: null,
      target_type: '',
      target_id: '',
      metric: 'cpu',
      condition: 'gt',
      threshold_value: '80',
      severity: 'warning',
      channel_id: null,
      cooldown: 300
    })
    setRFormError(null)
    setShowRuleWizard(true)
  }

  function openRuleEdit(rule) {
    setEditRule(rule)
    setWizardStep(0)
    setRuleForm({
      name: rule.name,
      org_id: rule.org_id,
      target_type: rule.target_type || '',
      target_id: rule.target_id || '',
      metric: rule.metric,
      condition: rule.condition,
      threshold_value: rule.threshold_value,
      severity: rule.severity,
      channel_id: rule.channel_id,
      cooldown: rule.cooldown || 300
    })
    setRFormError(null)
    setShowRuleWizard(true)
  }

  async function handleRuleSave() {
    setRFormError(null)
    if (!ruleForm.name.trim()) {
      setRFormError('Название обязательно')
      return
    }
    if (!ruleForm.threshold_value) {
      setRFormError('Укажите пороговое значение')
      return
    }
    setRSaving(true)
    try {
      const body = {
        ...ruleForm,
        org_id: ruleForm.org_id || null,
        target_type: ruleForm.target_type || null,
        target_id: ruleForm.target_id || null,
        channel_id: ruleForm.channel_id || null
      }
      if (editRule) {
        await apiFetch(`/api/notifications/rules/${editRule.id}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await apiFetch('/api/notifications/rules', { method: 'POST', body: JSON.stringify(body) })
      }
      setShowRuleWizard(false)
      await loadRules()
    } catch (err) {
      setRFormError(err.message || 'Ошибка сохранения')
    } finally {
      setRSaving(false)
    }
  }

  async function handleRuleDelete(id) {
    if (!confirm('Удалить правило?')) return
    try {
      await apiFetch(`/api/notifications/rules/${id}`, { method: 'DELETE' })
      await loadRules()
    } catch {
      setRError('Ошибка')
    }
  }

  async function handleRuleToggle(id) {
    try {
      await apiFetch(`/api/notifications/rules/${id}/toggle`, { method: 'POST' })
      await loadRules()
    } catch {
      setRError('Ошибка')
    }
  }

  // Telegram user handlers
  function openAddTgUser() {
    setAddTgUserForm({
      telegram_id: '',
      username: '',
      first_name: '',
      last_name: '',
      org_id: null,
      notify_critical: true,
      notify_warning: true,
      notify_info: false,
      notify_categories: []
    })
    setAddTgUserError(null)
    setShowAddTgUser(true)
  }

  async function handleAddTgUser() {
    if (!selectedBot) return
    if (!addTgUserForm.telegram_id.trim()) {
      setAddTgUserError('Telegram ID обязателен')
      return
    }
    setAddTgUserSaving(true)
    setAddTgUserError(null)
    try {
      await apiFetch(`/api/telegram/bots/${selectedBot.id}/users`, {
        method: 'POST',
        body: JSON.stringify(addTgUserForm)
      })
      setShowAddTgUser(false)
      await loadBotUsers(selectedBot.id)
    } catch (err) {
      setAddTgUserError(err.message || 'Ошибка создания')
    } finally {
      setAddTgUserSaving(false)
    }
  }

  function openTgUserEdit(u) {
    setEditTgUser(u)
    setTgUserForm({
      org_id: u.org_id || null,
      notify_critical: u.notify_critical,
      notify_warning: u.notify_warning,
      notify_info: u.notify_info,
      notify_categories: u.notify_categories || []
    })
  }

  async function handleTgUserSave() {
    if (!selectedBot || !editTgUser) return
    setTgUserSaving(true)
    try {
      await apiFetch(`/api/telegram/bots/${selectedBot.id}/users/${editTgUser.id}`, {
        method: 'PUT',
        body: JSON.stringify(tgUserForm)
      })
      setEditTgUser(null)
      await loadBotUsers(selectedBot.id)
    } catch {} finally {
      setTgUserSaving(false)
    }
  }

  async function handleTgUserToggle(uid) {
    if (!selectedBot) return
    try {
      await apiFetch(`/api/telegram/bots/${selectedBot.id}/users/${uid}/toggle`, { method: 'POST' })
      await loadBotUsers(selectedBot.id)
    } catch {}
  }

  async function handleTgUserDelete(uid) {
    if (!confirm('Удалить пользователя?')) return
    if (!selectedBot) return
    try {
      await apiFetch(`/api/telegram/bots/${selectedBot.id}/users/${uid}`, { method: 'DELETE' })
      await loadBotUsers(selectedBot.id)
    } catch {}
  }

  async function handleTgSend() {
    if (!selectedBot || !tgSendModal || !tgSendMsg.trim()) return
    setTgSending(true)
    setTgSendResult(null)
    try {
      const r = await apiFetch(`/api/telegram/bots/${selectedBot.id}/users/${tgSendModal.id}/send`, {
        method: 'POST',
        body: JSON.stringify({ message: tgSendMsg })
      })
      setTgSendResult(r)
    } catch (err) {
      setTgSendResult({ sent: false, error: err.message })
    } finally {
      setTgSending(false)
    }
  }

  async function handleSetupWebhook() {
    if (!selectedBot || !webhookUrl.trim()) return
    setWebhookSaving(true)
    try {
      await apiFetch(`/api/telegram/bots/${selectedBot.id}/setup-webhook`, {
        method: 'POST',
        body: JSON.stringify({ webhook_url: webhookUrl })
      })
      alert('Webhook успешно установлен!')
    } catch {} finally {
      setWebhookSaving(false)
    }
  }

  async function handleRemoveWebhook() {
    if (!selectedBot) return
    try {
      await apiFetch(`/api/telegram/bots/${selectedBot.id}/webhook`, { method: 'DELETE' })
      alert('Webhook удалён')
    } catch {}
  }

  async function handleImportUsers() {
    if (!selectedBot) return
    setImportingUsers(true)
    try {
      const r = await apiFetch(`/api/telegram/bots/${selectedBot.id}/import-users`, { method: 'POST' })
      alert(`Импортировано: ${r.imported} пользователей`)
      await loadBotUsers(selectedBot.id)
    } catch {} finally {
      setImportingUsers(false)
    }
  }

  if (!mounted) return null

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
      <div style={{ display: 'flex', minHeight: '100vh', background: '#090d16', color: '#f8fafc' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto', boxSizing: 'border-box' }}>
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 24,
              flexWrap: 'wrap',
              gap: 16
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 700,
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10
                }}
              >
                <Bell size={26} color="#38bdf8" />
                Центр оповещений и правила
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
                Пороговые правила мониторинга, каналы доставки (Telegram, Email, Webhook, Discord) и управление подписчиками
              </p>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {tab === 'rules' && (
                <button
                  onClick={openRuleWizard}
                  style={btnPrimaryStyle}
                >
                  <Plus size={16} />
                  Создать правило
                </button>
              )}
              {(tab === 'channels' || tab === 'emailWebhook') && (
                <button
                  onClick={openChAdd}
                  style={btnPrimaryStyle}
                >
                  <Plus size={16} />
                  Добавить канал
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 20,
              borderBottom: '1px solid #1e293b',
              paddingBottom: 4
            }}
          >
            {[
              { key: 'rules', label: 'Правила мониторинга', icon: Sliders, count: rules.length },
              { key: 'channels', label: 'Мессенджеры', icon: Send, count: messengerChannels.length },
              { key: 'emailWebhook', label: 'Email & Webhook', icon: Mail, count: emailWebhookChannels.length },
              { key: 'telegram', label: 'Telegram Бот', icon: MessageSquare, count: bots.length },
            ].map(t => {
              const Icon = t.icon
              const active = tab === t.key
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 16px',
                    background: active ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                    border: 'none',
                    borderBottom: active ? '2px solid #38bdf8' : '2px solid transparent',
                    color: active ? '#38bdf8' : '#94a3b8',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    borderRadius: '6px 6px 0 0'
                  }}
                >
                  <Icon size={16} color={active ? '#38bdf8' : '#64748b'} />
                  {t.label}
                  <span
                    style={{
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 10,
                      background: active ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                      color: active ? '#38bdf8' : '#64748b'
                    }}
                  >
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* ============ RULES TAB ============ */}
          {tab === 'rules' && (
            <>
              {rError && (
                <div style={errorBannerStyle}>
                  <AlertTriangle size={18} />
                  {rError}
                </div>
              )}

              {rLoading ? (
                <div style={loadingCardStyle}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                  <div>Загрузка правил уведомлений...</div>
                </div>
              ) : rules.length === 0 ? (
                <div style={emptyCardStyle}>
                  <div style={emptyIconContainer}>
                    <Sliders size={28} color="#38bdf8" />
                  </div>
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Нет активных правил уведомлений</div>
                  <div style={{ color: '#94a3b8', fontSize: 13, maxWidth: 420, margin: '8px auto 20px' }}>
                    Создайте правила, чтобы автоматически получать сигналы при превышении лимитов CPU, памяти, диска или падении сервисов.
                  </div>
                  <button onClick={openRuleWizard} style={btnPrimaryStyle}>
                    <Plus size={16} />
                    Создать первое правило
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {rules.map(r => {
                    const metricInfo = METRICS.find(m => m.value === r.metric)
                    const condInfo = CONDITIONS.find(c => c.value === r.condition)
                    const sevColors = { critical: '#ef4444', warning: '#f59e0b', info: '#38bdf8' }
                    const MetricIcon = metricInfo?.icon || Activity
                    const activeColor = sevColors[r.severity] || '#38bdf8'

                    return (
                      <div
                        key={r.id}
                        style={{
                          background: '#101726',
                          border: '1px solid #1e293b',
                          borderRadius: 10,
                          padding: 16,
                          opacity: r.is_enabled ? 1 : 0.5,
                          transition: 'opacity 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          flexWrap: 'wrap'
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: `${activeColor}15`,
                            border: `1px solid ${activeColor}30`,
                            flexShrink: 0
                          }}
                        >
                          <MetricIcon size={22} color={activeColor} />
                        </div>

                        <div style={{ flex: 1, minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>{r.name}</span>
                            <span
                              style={{
                                fontSize: 10,
                                padding: '2px 8px',
                                borderRadius: 10,
                                background: `${activeColor}20`,
                                color: activeColor,
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}
                            >
                              {r.severity}
                            </span>
                            {!r.is_enabled && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  background: 'rgba(239, 68, 68, 0.2)',
                                  color: '#f87171',
                                  fontWeight: 600
                                }}
                              >
                                ВЫКЛ
                              </span>
                            )}
                          </div>

                          <div
                            style={{
                              fontSize: 13,
                              color: '#94a3b8',
                              marginTop: 6,
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 16
                            }}
                          >
                            <span style={{ color: '#fff' }}>
                              <b>{metricInfo?.label || r.metric}</b> {condInfo?.short || r.condition}{' '}
                              <b>{r.threshold_value}{metricInfo?.unit || ''}</b>
                            </span>

                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Server size={13} color="#64748b" />
                              {r.target_name || (r.target_type ? `Все ${TARGET_TYPES.find(t => t.value === r.target_type)?.label?.toLowerCase() || r.target_type}` : 'Все ресурсы')}
                            </span>

                            {r.org_name && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Building2 size={13} color="#64748b" />
                                {r.org_name}
                              </span>
                            )}

                            {r.channel_name && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <Send size={13} color="#38bdf8" />
                                {r.channel_name}
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                            Сработало: {r.trigger_count || 0} раз
                            {r.last_triggered && <> · Последнее: {new Date(r.last_triggered).toLocaleString('ru-RU')}</>}
                            {r.cooldown > 0 && (
                              <>
                                {' '}· Cooldown:{' '}
                                {r.cooldown >= 3600
                                  ? `${r.cooldown / 3600} ч`
                                  : r.cooldown >= 60
                                  ? `${r.cooldown / 60} мин`
                                  : `${r.cooldown} с`}
                              </>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => handleRuleToggle(r.id)}
                            title={r.is_enabled ? 'Приостановить' : 'Включить'}
                            style={{
                              ...actionBtnStyle,
                              color: r.is_enabled ? '#facc15' : '#4ade80',
                              border: `1px solid ${r.is_enabled ? 'rgba(250, 204, 21, 0.3)' : 'rgba(74, 222, 128, 0.3)'}`
                            }}
                          >
                            {r.is_enabled ? <Pause size={14} /> : <Play size={14} />}
                          </button>
                          <button
                            onClick={() => openRuleEdit(r)}
                            title="Редактировать правило"
                            style={actionBtnStyle}
                          >
                            <Edit2 size={14} color="#94a3b8" />
                          </button>
                          <button
                            onClick={() => handleRuleDelete(r.id)}
                            title="Удалить правило"
                            style={{ ...actionBtnStyle, borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          >
                            <Trash2 size={14} color="#f87171" />
                          </button>
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
              {chError && (
                <div style={errorBannerStyle}>
                  <AlertTriangle size={18} />
                  {chError}
                </div>
              )}

              {chLoading ? (
                <div style={loadingCardStyle}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                  <div>Загрузка каналов...</div>
                </div>
              ) : messengerChannels.length === 0 ? (
                <div style={emptyCardStyle}>
                  <div style={emptyIconContainer}>
                    <Send size={28} color="#38bdf8" />
                  </div>
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Каналы мессенджеров не настроены</div>
                  <div style={{ color: '#94a3b8', fontSize: 13, maxWidth: 420, margin: '8px auto 20px' }}>
                    Подключите Telegram бота или Discord Webhook для доставки мгновенных оповещений в командные чаты.
                  </div>
                  <button onClick={openChAdd} style={btnPrimaryStyle}>
                    <Plus size={16} />
                    Добавить канал
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {messengerChannels.map(ch => {
                    const ct = CHANNEL_TYPES.find(c => c.value === ch.channel_type)
                    const ChannelIcon = ct?.icon || Send
                    return (
                      <div
                        key={ch.id}
                        style={{
                          background: '#101726',
                          border: '1px solid #1e293b',
                          borderRadius: 10,
                          padding: 16,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          opacity: ch.is_enabled ? 1 : 0.5,
                          transition: 'opacity 0.2s',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: `${ct?.color || '#38bdf8'}15`,
                            border: `1px solid ${ct?.color || '#38bdf8'}30`,
                            flexShrink: 0
                          }}
                        >
                          <ChannelIcon size={22} color={ct?.color || '#38bdf8'} />
                        </div>

                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>{ch.name}</span>
                            <span
                              style={{
                                fontSize: 10,
                                padding: '2px 8px',
                                borderRadius: 10,
                                background: `${ct?.color || '#64748b'}20`,
                                color: ct?.color || '#94a3b8',
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}
                            >
                              {ct?.label || ch.channel_type}
                            </span>
                            {!ch.is_enabled && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  background: 'rgba(239, 68, 68, 0.2)',
                                  color: '#f87171',
                                  fontWeight: 600
                                }}
                              >
                                ВЫКЛ
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                            Серьезность: <span style={{ color: '#fff' }}>{SEVERITIES.find(s => s.value === ch.severity_filter)?.label || ch.severity_filter}</span>
                            {' · '}Категория: <span style={{ color: '#fff' }}>{CATEGORIES.find(c => c.value === ch.category_filter)?.label || ch.category_filter}</span>
                          </div>

                          {testResult?.id === ch.id && (
                            <div
                              style={{
                                fontSize: 12,
                                marginTop: 6,
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: testResult.success ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                color: testResult.success ? '#4ade80' : '#f87171',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6
                              }}
                            >
                              {testResult.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                              {testResult.success ? 'Тест успешно отправлен!' : `Ошибка: ${testResult.message}`}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => handleChTest(ch.id)}
                            disabled={testingId === ch.id}
                            style={{
                              ...actionBtnStyle,
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              padding: '6px 12px',
                              gap: 6
                            }}
                          >
                            <FlaskConical size={14} />
                            {testingId === ch.id ? 'Тест...' : 'Тест'}
                          </button>
                          <button
                            onClick={() => handleChToggle(ch.id)}
                            style={{
                              ...actionBtnStyle,
                              color: ch.is_enabled ? '#facc15' : '#4ade80',
                              border: `1px solid ${ch.is_enabled ? 'rgba(250, 204, 21, 0.3)' : 'rgba(74, 222, 128, 0.3)'}`,
                              padding: '6px 12px',
                              gap: 6
                            }}
                          >
                            {ch.is_enabled ? <Pause size={14} /> : <Play size={14} />}
                            {ch.is_enabled ? 'Выкл' : 'Вкл'}
                          </button>
                          <button onClick={() => openChEdit(ch)} style={actionBtnStyle}>
                            <Edit2 size={14} color="#94a3b8" />
                          </button>
                          <button
                            onClick={() => handleChDelete(ch.id)}
                            style={{ ...actionBtnStyle, borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          >
                            <Trash2 size={14} color="#f87171" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ============ EMAIL & WEBHOOK TAB ============ */}
          {tab === 'emailWebhook' && (
            <>
              {chError && (
                <div style={errorBannerStyle}>
                  <AlertTriangle size={18} />
                  {chError}
                </div>
              )}

              {chLoading ? (
                <div style={loadingCardStyle}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                  <div>Загрузка каналов Email и Webhook...</div>
                </div>
              ) : emailWebhookChannels.length === 0 ? (
                <div style={emptyCardStyle}>
                  <div style={emptyIconContainer}>
                    <Mail size={28} color="#38bdf8" />
                  </div>
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Email и Webhook каналы не созданы</div>
                  <div style={{ color: '#94a3b8', fontSize: 13, maxWidth: 420, margin: '8px auto 20px' }}>
                    Настройте SMTP-сервер для рассылки почтовых уведомлений или Webhook для интеграции с внешними системами.
                  </div>
                  <button onClick={openChAdd} style={btnPrimaryStyle}>
                    <Plus size={16} />
                    Добавить канал
                  </button>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {emailWebhookChannels.map(ch => {
                    const ct = CHANNEL_TYPES.find(c => c.value === ch.channel_type)
                    const ChannelIcon = ct?.icon || Mail
                    return (
                      <div
                        key={ch.id}
                        style={{
                          background: '#101726',
                          border: '1px solid #1e293b',
                          borderRadius: 10,
                          padding: 16,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 16,
                          opacity: ch.is_enabled ? 1 : 0.5,
                          transition: 'opacity 0.2s',
                          flexWrap: 'wrap'
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: `${ct?.color || '#f87171'}15`,
                            border: `1px solid ${ct?.color || '#f87171'}30`,
                            flexShrink: 0
                          }}
                        >
                          <ChannelIcon size={22} color={ct?.color || '#f87171'} />
                        </div>

                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>{ch.name}</span>
                            <span
                              style={{
                                fontSize: 10,
                                padding: '2px 8px',
                                borderRadius: 10,
                                background: `${ct?.color || '#64748b'}20`,
                                color: ct?.color || '#94a3b8',
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}
                            >
                              {ct?.label || ch.channel_type}
                            </span>
                            {!ch.is_enabled && (
                              <span
                                style={{
                                  fontSize: 10,
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  background: 'rgba(239, 68, 68, 0.2)',
                                  color: '#f87171',
                                  fontWeight: 600
                                }}
                              >
                                ВЫКЛ
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                            Серьезность: <span style={{ color: '#fff' }}>{SEVERITIES.find(s => s.value === ch.severity_filter)?.label || ch.severity_filter}</span>
                            {' · '}Категория: <span style={{ color: '#fff' }}>{CATEGORIES.find(c => c.value === ch.category_filter)?.label || ch.category_filter}</span>
                          </div>

                          {ch.channel_type === 'email' && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                              Получатели: {(ch.config?.to_emails || []).slice(0, 3).join(', ')}
                              {ch.config?.to_emails?.length > 3 ? ` +${ch.config.to_emails.length - 3}` : ''}
                            </div>
                          )}

                          {ch.channel_type === 'webhook' && (
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, wordBreak: 'break-all', fontFamily: 'monospace' }}>
                              URL: {ch.config?.url?.substring(0, 70)}...
                            </div>
                          )}

                          {testResult?.id === ch.id && (
                            <div
                              style={{
                                fontSize: 12,
                                marginTop: 6,
                                padding: '4px 10px',
                                borderRadius: 6,
                                background: testResult.success ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                color: testResult.success ? '#4ade80' : '#f87171',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6
                              }}
                            >
                              {testResult.success ? <Check size={14} /> : <AlertTriangle size={14} />}
                              {testResult.success ? 'Тест успешно отправлен!' : `Ошибка: ${testResult.message}`}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            onClick={() => handleChTest(ch.id)}
                            disabled={testingId === ch.id}
                            style={{
                              ...actionBtnStyle,
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              padding: '6px 12px',
                              gap: 6
                            }}
                          >
                            <FlaskConical size={14} />
                            {testingId === ch.id ? 'Тест...' : 'Тест'}
                          </button>
                          <button
                            onClick={() => handleChToggle(ch.id)}
                            style={{
                              ...actionBtnStyle,
                              color: ch.is_enabled ? '#facc15' : '#4ade80',
                              border: `1px solid ${ch.is_enabled ? 'rgba(250, 204, 21, 0.3)' : 'rgba(74, 222, 128, 0.3)'}`,
                              padding: '6px 12px',
                              gap: 6
                            }}
                          >
                            {ch.is_enabled ? <Pause size={14} /> : <Play size={14} />}
                            {ch.is_enabled ? 'Выкл' : 'Вкл'}
                          </button>
                          <button onClick={() => openChEdit(ch)} style={actionBtnStyle}>
                            <Edit2 size={14} color="#94a3b8" />
                          </button>
                          <button
                            onClick={() => handleChDelete(ch.id)}
                            style={{ ...actionBtnStyle, borderColor: 'rgba(239, 68, 68, 0.3)' }}
                          >
                            <Trash2 size={14} color="#f87171" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ============ TELEGRAM TAB ============ */}
          {tab === 'telegram' && (
            <>
              {tgError && (
                <div style={errorBannerStyle}>
                  <AlertTriangle size={18} />
                  {tgError}
                </div>
              )}

              {tgLoading ? (
                <div style={loadingCardStyle}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                  <div>Загрузка данных бота...</div>
                </div>
              ) : bots.length === 0 ? (
                <div style={emptyCardStyle}>
                  <div style={emptyIconContainer}>
                    <Send size={28} color="#38bdf8" />
                  </div>
                  <div style={{ color: '#fff', fontSize: 16, fontWeight: 600 }}>Telegram боты еще не добавлены</div>
                  <div style={{ color: '#94a3b8', fontSize: 13, maxWidth: 420, margin: '8px auto 20px' }}>
                    Перейдите на страницу интеграции Telegram для создания и настройки бота оповещений.
                  </div>
                  <a
                    href="/telegram"
                    style={{
                      ...btnPrimaryStyle,
                      textDecoration: 'none',
                      display: 'inline-flex'
                    }}
                  >
                    Перейти в раздел Telegram
                  </a>
                </div>
              ) : (
                <>
                  {/* Bot cards selector */}
                  <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    {bots.map(b => {
                      const isSel = selectedBot?.id === b.id
                      const isOnline = b.last_status === 'online'
                      return (
                        <button
                          key={b.id}
                          onClick={() => setSelectedBot(b)}
                          style={{
                            padding: '12px 18px',
                            borderRadius: 10,
                            cursor: 'pointer',
                            textAlign: 'left',
                            minWidth: 220,
                            transition: 'all 0.15s ease',
                            border: `1px solid ${isSel ? 'rgba(56, 189, 248, 0.5)' : '#1e293b'}`,
                            background: isSel ? 'rgba(37, 99, 235, 0.15)' : '#101726',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12
                          }}
                        >
                          <div
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 8,
                              background: isSel ? 'rgba(56, 189, 248, 0.2)' : '#1e293b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}
                          >
                            <Send size={18} color={isSel ? '#38bdf8' : '#94a3b8'} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{b.name}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                              @{b.last_username || 'unknown'} ·{' '}
                              <span style={{ color: isOnline ? '#4ade80' : '#f87171' }}>
                                {isOnline ? 'Online' : 'Offline'}
                              </span>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  {selectedBot && (
                    <>
                      {/* Webhook setup card */}
                      <div
                        style={{
                          background: '#101726',
                          border: '1px solid #1e293b',
                          borderRadius: 10,
                          padding: 16,
                          marginBottom: 16
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Settings size={16} color="#38bdf8" />
                              Webhook для автоматической регистрации пользователей
                            </h4>
                            <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 0' }}>
                              Установите URL, чтобы сотрудники регистрировались как подписчики при отправке команды /start
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              value={webhookUrl}
                              onChange={e => setWebhookUrl(e.target.value)}
                              placeholder={`https://ваш-домен/api/telegram/bots/${selectedBot.id}/webhook`}
                              style={{ ...modernInputStyle, width: 340, fontSize: 12 }}
                            />
                            <button
                              onClick={handleSetupWebhook}
                              disabled={webhookSaving}
                              style={{ ...btnPrimaryStyle, padding: '8px 14px', fontSize: 12 }}
                            >
                              {webhookSaving ? 'Сохранение...' : 'Установить'}
                            </button>
                            <button
                              onClick={handleRemoveWebhook}
                              style={{
                                padding: '8px 14px',
                                borderRadius: 6,
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#f87171',
                                fontSize: 12,
                                fontWeight: 500,
                                cursor: 'pointer'
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Actions toolbar */}
                      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                        <button onClick={openAddTgUser} style={btnPrimaryStyle}>
                          <Plus size={14} />
                          Добавить подписчика
                        </button>
                        <button
                          onClick={handleImportUsers}
                          disabled={importingUsers}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 14px',
                            borderRadius: 6,
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            background: 'rgba(56, 189, 248, 0.1)',
                            color: '#38bdf8',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <RefreshCw size={14} className={importingUsers ? 'spin' : ''} />
                          {importingUsers ? 'Импорт...' : 'Импорт из обновлений'}
                        </button>
                        <button
                          onClick={() => loadBotUsers(selectedBot.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 14px',
                            borderRadius: 6,
                            border: '1px solid #334155',
                            background: '#1e293b',
                            color: '#94a3b8',
                            fontSize: 12,
                            cursor: 'pointer'
                          }}
                        >
                          <RefreshCw size={14} />
                          Обновить
                        </button>
                      </div>

                      {/* Users list */}
                      {botUsersLoading ? (
                        <div style={loadingCardStyle}>
                          <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px' }} />
                          Загрузка подписчиков...
                        </div>
                      ) : botUsers.length === 0 ? (
                        <div style={emptyCardStyle}>
                          <Users size={32} color="#64748b" style={{ margin: '0 auto 12px' }} />
                          <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Нет зарегистрированных подписчиков</div>
                          <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                            Попросите пользователей запустить бота через /start или добавьте их вручную
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gap: 10 }}>
                          {botUsers.map(u => (
                            <div
                              key={u.id}
                              style={{
                                background: '#101726',
                                border: '1px solid #1e293b',
                                borderRadius: 10,
                                padding: 16,
                                opacity: u.is_active ? 1 : 0.5,
                                transition: 'opacity 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 14,
                                flexWrap: 'wrap'
                              }}
                            >
                              <div
                                style={{
                                  width: 40,
                                  height: 40,
                                  borderRadius: '50%',
                                  background: u.is_active ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}
                              >
                                {u.is_active ? <CheckCircle2 size={18} color="#22c55e" /> : <XCircle size={18} color="#ef4444" />}
                              </div>

                              <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>
                                    {u.first_name || 'Без имени'}{u.last_name ? ` ${u.last_name}` : ''}
                                  </span>
                                  {u.username && <span style={{ fontSize: 12, color: '#38bdf8' }}>@{u.username}</span>}
                                  {!u.is_active && (
                                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', fontWeight: 600 }}>
                                      ВЫКЛ
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                                  <span>ID: {u.telegram_id}</span>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Building2 size={12} color="#64748b" />
                                    {u.org_name || 'Все организации'}
                                  </span>
                                </div>

                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {u.notify_critical && (
                                    <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', fontSize: 10, fontWeight: 600 }}>
                                      CRITICAL
                                    </span>
                                  )}
                                  {u.notify_warning && (
                                    <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(234, 179, 8, 0.15)', color: '#facc15', fontSize: 10, fontWeight: 600 }}>
                                      WARNING
                                    </span>
                                  )}
                                  {u.notify_info && (
                                    <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: 10, fontWeight: 600 }}>
                                      INFO
                                    </span>
                                  )}
                                  <span>
                                    Категории: {u.notify_categories?.length > 0 ? u.notify_categories.join(', ') : 'Все'}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                <button onClick={() => openTgUserEdit(u)} style={actionBtnStyle} title="Настройки">
                                  <Settings size={14} color="#94a3b8" />
                                </button>
                                <button
                                  onClick={() => {
                                    setTgSendModal(u)
                                    setTgSendMsg('')
                                    setTgSendResult(null)
                                  }}
                                  style={actionBtnStyle}
                                  title="Отправить сообщение"
                                >
                                  <MessageSquare size={14} color="#38bdf8" />
                                </button>
                                <button onClick={() => handleTgUserToggle(u.id)} style={actionBtnStyle} title={u.is_active ? 'Выкл' : 'Вкл'}>
                                  {u.is_active ? <Pause size={14} color="#facc15" /> : <Play size={14} color="#4ade80" />}
                                </button>
                                <button
                                  onClick={() => handleTgUserDelete(u.id)}
                                  style={{ ...actionBtnStyle, borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                  title="Удалить"
                                >
                                  <Trash2 size={14} color="#f87171" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}

          {/* ============ CHANNEL MODAL ============ */}
          {showChAdd && (
            <div style={modalOverlayStyle} onClick={() => setShowChAdd(false)}>
              <div style={modalCardStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
                    {editCh ? 'Редактировать канал' : 'Добавить канал уведомлений'}
                  </h3>
                  <button onClick={() => setShowChAdd(false)} style={closeBtnStyle}>
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleChSave}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                        Название канала <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        value={chForm.name}
                        onChange={e => setChForm({ ...chForm, name: e.target.value })}
                        placeholder="Например: Корпоративный Telegram"
                        style={modernInputStyle}
                      />
                    </div>

                    {!editCh && (
                      <div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Тип канала</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                          {CHANNEL_TYPES.map(ct => {
                            const Icon = ct.icon
                            const isSel = chForm.channel_type === ct.value
                            return (
                              <button
                                key={ct.value}
                                type="button"
                                onClick={() => setChForm({ ...chForm, channel_type: ct.value, config: {} })}
                                style={{
                                  padding: '10px 6px',
                                  borderRadius: 8,
                                  border: `1px solid ${isSel ? ct.color : '#1e293b'}`,
                                  background: isSel ? `${ct.color}15` : '#090d16',
                                  color: isSel ? '#fff' : '#94a3b8',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  textAlign: 'center',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 6
                                }}
                              >
                                <Icon size={18} color={isSel ? ct.color : '#64748b'} />
                                <span>{ct.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div style={{ padding: 14, background: '#090d16', borderRadius: 8, border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>
                        Параметры подключения {CHANNEL_TYPES.find(c => c.value === chForm.channel_type)?.label}
                      </div>
                      <ConfigForm
                        type={chForm.channel_type}
                        config={chForm.config}
                        onChange={config => setChForm({ ...chForm, config })}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Фильтр важности</label>
                        <select
                          value={chForm.severity_filter}
                          onChange={e => setChForm({ ...chForm, severity_filter: e.target.value })}
                          style={modernInputStyle}
                        >
                          {SEVERITIES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Фильтр категории</label>
                        <select
                          value={chForm.category_filter}
                          onChange={e => setChForm({ ...chForm, category_filter: e.target.value })}
                          style={modernInputStyle}
                        >
                          {CATEGORIES.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {chFormError && (
                      <div style={{ color: '#f87171', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={14} />
                        {chFormError}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={() => setShowChAdd(false)}
                        style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                      >
                        Отмена
                      </button>
                      <button
                        type="submit"
                        disabled={chSaving}
                        style={btnPrimaryStyle}
                      >
                        {chSaving ? 'Сохранение...' : editCh ? 'Сохранить' : 'Создать канал'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ============ RULE WIZARD MODAL ============ */}
          {showRuleWizard && (
            <div style={modalOverlayStyle} onClick={() => setShowRuleWizard(false)}>
              <div style={{ ...modalCardStyle, maxWidth: 620, padding: 0 }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px 24px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>
                      {editRule ? 'Редактировать правило мониторинга' : 'Мастер создания правила'}
                    </h3>
                    <button onClick={() => setShowRuleWizard(false)} style={closeBtnStyle}>
                      <X size={18} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #1e293b' }}>
                    {WIZARD_STEPS.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setWizardStep(i)}
                        style={{
                          flex: 1,
                          padding: '10px 4px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          borderBottom: `2px solid ${i === wizardStep ? '#38bdf8' : i < wizardStep ? '#4ade80' : 'transparent'}`,
                          color: i === wizardStep ? '#38bdf8' : i < wizardStep ? '#4ade80' : '#64748b',
                          fontSize: 12,
                          fontWeight: 600,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            fontSize: 10,
                            marginRight: 6,
                            background: i < wizardStep ? '#4ade80' : i === wizardStep ? '#38bdf8' : '#1e293b',
                            color: i <= wizardStep ? '#000' : '#94a3b8'
                          }}
                        >
                          {i < wizardStep ? '✓' : i + 1}
                        </span>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '20px 24px 24px' }}>
                  {wizardStep === 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                          Название правила <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          value={ruleForm.name}
                          onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })}
                          placeholder="Например: Загрузка CPU сервера > 90%"
                          style={modernInputStyle}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Организация</label>
                        <select
                          value={ruleForm.org_id || ''}
                          onChange={e =>
                            setRuleForm({ ...ruleForm, org_id: e.target.value ? parseInt(e.target.value) : null, target_id: '' })
                          }
                          style={modernInputStyle}
                        >
                          <option value="">Все организации</option>
                          {orgs.map(o => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Тип целевого ресурса</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                          {TARGET_TYPES.map(tt => {
                            const Icon = tt.icon
                            const isSel = ruleForm.target_type === tt.value
                            return (
                              <button
                                key={tt.value}
                                type="button"
                                onClick={() => setRuleForm({ ...ruleForm, target_type: tt.value, target_id: '' })}
                                style={{
                                  padding: '12px 8px',
                                  borderRadius: 8,
                                  border: `1px solid ${isSel ? '#38bdf8' : '#1e293b'}`,
                                  background: isSel ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                                  color: isSel ? '#fff' : '#94a3b8',
                                  cursor: 'pointer',
                                  textAlign: 'center',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  gap: 6
                                }}
                              >
                                <Icon size={20} color={isSel ? '#38bdf8' : '#64748b'} />
                                <span style={{ fontSize: 12 }}>{tt.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {ruleForm.target_type && (
                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Конкретный ресурс</label>
                          <select
                            value={ruleForm.target_id || ''}
                            onChange={e => setRuleForm({ ...ruleForm, target_id: e.target.value })}
                            style={modernInputStyle}
                          >
                            <option value="">
                              Все {TARGET_TYPES.find(t => t.value === ruleForm.target_type)?.label?.toLowerCase()}
                            </option>
                            {filteredTargets.map(t => (
                              <option key={t.id} value={t.id}>
                                {t.name} {t.host ? `(${t.host})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {wizardStep === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Метрика проверки</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                          {availableMetrics.map(m => {
                            const Icon = m.icon
                            const isSel = ruleForm.metric === m.value
                            return (
                              <button
                                key={m.value}
                                type="button"
                                onClick={() => setRuleForm({ ...ruleForm, metric: m.value })}
                                style={{
                                  padding: '10px 10px',
                                  borderRadius: 8,
                                  border: `1px solid ${isSel ? '#38bdf8' : '#1e293b'}`,
                                  background: isSel ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                                  color: isSel ? '#fff' : '#94a3b8',
                                  cursor: 'pointer',
                                  textAlign: 'left',
                                  fontSize: 12,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8
                                }}
                              >
                                <Icon size={16} color={isSel ? '#38bdf8' : '#64748b'} />
                                <span>{m.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Условие</label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {CONDITIONS.map(c => {
                              const isSel = ruleForm.condition === c.value
                              return (
                                <button
                                  key={c.value}
                                  type="button"
                                  onClick={() => setRuleForm({ ...ruleForm, condition: c.value })}
                                  style={{
                                    padding: '8px',
                                    borderRadius: 6,
                                    border: `1px solid ${isSel ? '#38bdf8' : '#1e293b'}`,
                                    background: isSel ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                                    color: isSel ? '#fff' : '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: 12,
                                    textAlign: 'center'
                                  }}
                                >
                                  <div style={{ fontSize: 15, fontWeight: 700 }}>{c.short}</div>
                                  <div style={{ fontSize: 10, color: '#64748b' }}>{c.label.split('(')[0].trim()}</div>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Пороговое значение</label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="number"
                              value={ruleForm.threshold_value}
                              onChange={e => setRuleForm({ ...ruleForm, threshold_value: e.target.value })}
                              style={{
                                ...modernInputStyle,
                                paddingRight: 40,
                                fontSize: 18,
                                fontWeight: 700,
                                textAlign: 'center',
                                height: 50
                              }}
                            />
                            <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: 13 }}>
                              {METRICS.find(m => m.value === ruleForm.metric)?.unit || ''}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Уровень критичности</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[
                            { v: 'critical', l: 'Critical', c: '#ef4444' },
                            { v: 'warning', l: 'Warning', c: '#f59e0b' },
                            { v: 'info', l: 'Info', c: '#38bdf8' }
                          ].map(s => {
                            const isSel = ruleForm.severity === s.v
                            return (
                              <button
                                key={s.v}
                                type="button"
                                onClick={() => setRuleForm({ ...ruleForm, severity: s.v })}
                                style={{
                                  flex: 1,
                                  padding: '10px',
                                  borderRadius: 8,
                                  border: `1px solid ${isSel ? s.c : '#1e293b'}`,
                                  background: isSel ? `${s.c}20` : '#090d16',
                                  color: isSel ? s.c : '#64748b',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                  fontSize: 13,
                                  textAlign: 'center'
                                }}
                              >
                                {s.l}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Канал уведомления</label>
                        {channels.length === 0 ? (
                          <div style={{ padding: 16, background: 'rgba(234, 179, 8, 0.1)', border: '1px solid rgba(234, 179, 8, 0.3)', borderRadius: 8, fontSize: 13, color: '#facc15' }}>
                            Каналы еще не настроены. Создайте канал во вкладке «Мессенджеры» или «Email & Webhook».
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => setRuleForm({ ...ruleForm, channel_id: null })}
                              style={{
                                padding: '12px 14px',
                                borderRadius: 8,
                                border: `1px solid ${!ruleForm.channel_id ? '#38bdf8' : '#1e293b'}`,
                                background: !ruleForm.channel_id ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                                color: '#fff',
                                cursor: 'pointer',
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10
                              }}
                            >
                              <Radio size={16} color="#38bdf8" />
                              <div>
                                <span style={{ fontWeight: 600 }}>Все доступные каналы</span>
                                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 8 }}>Отправлять на все активные каналы</span>
                              </div>
                            </button>

                            {channels
                              .filter(c => c.is_enabled)
                              .map(ch => {
                                const ct = CHANNEL_TYPES.find(c => c.value === ch.channel_type)
                                const Icon = ct?.icon || Send
                                const isSel = ruleForm.channel_id === ch.id
                                return (
                                  <button
                                    key={ch.id}
                                    type="button"
                                    onClick={() => setRuleForm({ ...ruleForm, channel_id: ch.id })}
                                    style={{
                                      padding: '12px 14px',
                                      borderRadius: 8,
                                      border: `1px solid ${isSel ? '#38bdf8' : '#1e293b'}`,
                                      background: isSel ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                                      color: '#fff',
                                      cursor: 'pointer',
                                      textAlign: 'left',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 10
                                    }}
                                  >
                                    <Icon size={16} color={ct?.color || '#38bdf8'} />
                                    <div>
                                      <span style={{ fontWeight: 600 }}>{ch.name}</span>
                                      <span style={{ fontSize: 10, marginLeft: 8, padding: '1px 6px', borderRadius: 4, background: `${ct?.color || '#64748b'}20`, color: ct?.color || '#94a3b8' }}>
                                        {ct?.label}
                                      </span>
                                    </div>
                                  </button>
                                )
                              })}
                          </div>
                        )}
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                          Интервал подавления повторов (Cooldown)
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                          {COOLDOWNS.map(cd => {
                            const isSel = ruleForm.cooldown === cd.value
                            return (
                              <button
                                key={cd.value}
                                type="button"
                                onClick={() => setRuleForm({ ...ruleForm, cooldown: cd.value })}
                                style={{
                                  padding: '8px',
                                  borderRadius: 6,
                                  border: `1px solid ${isSel ? '#38bdf8' : '#1e293b'}`,
                                  background: isSel ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                                  color: isSel ? '#fff' : '#94a3b8',
                                  cursor: 'pointer',
                                  fontSize: 12,
                                  textAlign: 'center'
                                }}
                              >
                                {cd.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ padding: 16, background: '#090d16', borderRadius: 8, border: '1px solid #1e293b' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 12 }}>
                          {ruleForm.name || 'Без названия'}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                          <div>
                            <span style={{ color: '#64748b' }}>Организация:</span>{' '}
                            <span style={{ color: '#fff' }}>
                              {ruleForm.org_id ? orgs.find(o => o.id === ruleForm.org_id)?.name || '—' : 'Все организации'}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Тип ресурса:</span>{' '}
                            <span style={{ color: '#fff' }}>
                              {TARGET_TYPES.find(t => t.value === ruleForm.target_type)?.label || 'Все ресурсы'}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Ресурс:</span>{' '}
                            <span style={{ color: '#fff' }}>
                              {ruleForm.target_id
                                ? filteredTargets.find(t => String(t.id) === String(ruleForm.target_id))?.name || ruleForm.target_id
                                : 'Все'}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Метрика:</span>{' '}
                            <span style={{ color: '#fff' }}>
                              {METRICS.find(m => m.value === ruleForm.metric)?.label || ruleForm.metric}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Условие:</span>{' '}
                            <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 14 }}>
                              {CONDITIONS.find(c => c.value === ruleForm.condition)?.short} {ruleForm.threshold_value}
                              {METRICS.find(m => m.value === ruleForm.metric)?.unit || ''}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Критичность:</span>{' '}
                            <span
                              style={{
                                color: { critical: '#ef4444', warning: '#f59e0b', info: '#38bdf8' }[ruleForm.severity],
                                fontWeight: 700,
                                textTransform: 'uppercase'
                              }}
                            >
                              {ruleForm.severity}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Канал:</span>{' '}
                            <span style={{ color: '#fff' }}>
                              {ruleForm.channel_id ? channels.find(c => c.id === ruleForm.channel_id)?.name || '—' : 'Все каналы'}
                            </span>
                          </div>
                          <div>
                            <span style={{ color: '#64748b' }}>Cooldown:</span>{' '}
                            <span style={{ color: '#fff' }}>
                              {COOLDOWNS.find(c => c.value === ruleForm.cooldown)?.label || `${ruleForm.cooldown} с`}
                            </span>
                          </div>
                        </div>
                      </div>

                      {rFormError && (
                        <div style={{ color: '#f87171', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AlertTriangle size={14} />
                          {rFormError}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => (wizardStep > 0 ? setWizardStep(wizardStep - 1) : setShowRuleWizard(false))}
                      style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                    >
                      {wizardStep > 0 ? '← Назад' : 'Отмена'}
                    </button>

                    {wizardStep < 3 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (wizardStep === 0 && !ruleForm.name.trim()) {
                            setRFormError('Укажите название правила')
                            return
                          }
                          setRFormError(null)
                          setWizardStep(wizardStep + 1)
                        }}
                        style={btnPrimaryStyle}
                      >
                        Далее →
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={rSaving}
                        onClick={handleRuleSave}
                        style={btnPrimaryStyle}
                      >
                        {rSaving ? 'Сохранение...' : editRule ? 'Сохранить изменения' : 'Создать правило'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ TELEGRAM USER EDIT MODAL ============ */}
          {editTgUser && (
            <div style={modalOverlayStyle} onClick={() => setEditTgUser(null)}>
              <div style={modalCardStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Settings size={18} color="#38bdf8" />
                    Настройка подписчика
                  </h3>
                  <button onClick={() => setEditTgUser(null)} style={closeBtnStyle}>
                    <X size={18} />
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 16,
                    padding: 12,
                    background: '#090d16',
                    borderRadius: 8,
                    border: '1px solid #1e293b'
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: 'rgba(56, 189, 248, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Users size={18} color="#38bdf8" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>
                      {editTgUser.first_name || 'Без имени'}
                      {editTgUser.last_name ? ` ${editTgUser.last_name}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#38bdf8' }}>
                      {editTgUser.username ? `@${editTgUser.username}` : `ID: ${editTgUser.telegram_id}`}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Организация</label>
                    <select
                      value={tgUserForm.org_id || ''}
                      onChange={e =>
                        setTgUserForm({ ...tgUserForm, org_id: e.target.value ? parseInt(e.target.value) : null })
                      }
                      style={modernInputStyle}
                    >
                      <option value="">Не назначена (Все уведомления)</option>
                      {orgs.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Уровни критичности</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { key: 'notify_critical', label: 'Critical', color: '#ef4444' },
                        { key: 'notify_warning', label: 'Warning', color: '#f59e0b' },
                        { key: 'notify_info', label: 'Info', color: '#38bdf8' }
                      ].map(s => {
                        const active = tgUserForm[s.key]
                        return (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => setTgUserForm({ ...tgUserForm, [s.key]: !active })}
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontWeight: 600,
                              fontSize: 12,
                              textAlign: 'center',
                              border: `1px solid ${active ? s.color : '#334155'}`,
                              background: active ? `${s.color}20` : '#090d16',
                              color: active ? s.color : '#64748b'
                            }}
                          >
                            {active ? '✓ ' : '✕ '} {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Категории уведомлений</label>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>Если пусто — доставляются все категории</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                      {ALL_CATEGORIES.map(cat => {
                        const active = (tgUserForm.notify_categories || []).includes(cat.value)
                        return (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => {
                              const cats = tgUserForm.notify_categories || []
                              setTgUserForm({
                                ...tgUserForm,
                                notify_categories: active ? cats.filter(c => c !== cat.value) : [...cats, cat.value]
                              })
                            }}
                            style={{
                              padding: '8px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              textAlign: 'center',
                              border: `1px solid ${active ? '#38bdf8' : '#1e293b'}`,
                              background: active ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                              color: active ? '#38bdf8' : '#64748b'
                            }}
                          >
                            {active ? '✓ ' : '○ '} {cat.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => setEditTgUser(null)}
                      style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={tgUserSaving}
                      onClick={handleTgUserSave}
                      style={btnPrimaryStyle}
                    >
                      {tgUserSaving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ ADD TELEGRAM USER MODAL ============ */}
          {showAddTgUser && (
            <div style={modalOverlayStyle} onClick={() => setShowAddTgUser(false)}>
              <div style={modalCardStyle} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Plus size={18} color="#38bdf8" />
                    Добавить подписчика
                  </h3>
                  <button onClick={() => setShowAddTgUser(false)} style={closeBtnStyle}>
                    <X size={18} />
                  </button>
                </div>

                {addTgUserError && (
                  <div style={errorBannerStyle}>
                    <AlertTriangle size={16} />
                    {addTgUserError}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>
                      Telegram ID <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      value={addTgUserForm.telegram_id}
                      onChange={e => setAddTgUserForm({ ...addTgUserForm, telegram_id: e.target.value })}
                      placeholder="Например: 123456789"
                      style={modernInputStyle}
                    />
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      Числовой ID пользователя в Telegram (можно узнать через @userinfobot)
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Имя</label>
                      <input
                        value={addTgUserForm.first_name}
                        onChange={e => setAddTgUserForm({ ...addTgUserForm, first_name: e.target.value })}
                        placeholder="Имя"
                        style={modernInputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Фамилия</label>
                      <input
                        value={addTgUserForm.last_name}
                        onChange={e => setAddTgUserForm({ ...addTgUserForm, last_name: e.target.value })}
                        placeholder="Фамилия"
                        style={modernInputStyle}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Username (без @)</label>
                    <input
                      value={addTgUserForm.username}
                      onChange={e => setAddTgUserForm({ ...addTgUserForm, username: e.target.value })}
                      placeholder="username"
                      style={modernInputStyle}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Организация</label>
                    <select
                      value={addTgUserForm.org_id || ''}
                      onChange={e =>
                        setAddTgUserForm({ ...addTgUserForm, org_id: e.target.value ? parseInt(e.target.value) : null })
                      }
                      style={modernInputStyle}
                    >
                      <option value="">Не назначена</option>
                      {orgs.map(o => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>Уровни важности</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { key: 'notify_critical', label: 'Critical', color: '#ef4444' },
                        { key: 'notify_warning', label: 'Warning', color: '#f59e0b' },
                        { key: 'notify_info', label: 'Info', color: '#38bdf8' }
                      ].map(s => {
                        const active = addTgUserForm[s.key]
                        return (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => setAddTgUserForm({ ...addTgUserForm, [s.key]: !active })}
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontWeight: 600,
                              fontSize: 12,
                              textAlign: 'center',
                              border: `1px solid ${active ? s.color : '#334155'}`,
                              background: active ? `${s.color}20` : '#090d16',
                              color: active ? s.color : '#64748b'
                            }}
                          >
                            {active ? '✓ ' : '✕ '} {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Категории уведомлений</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                      {ALL_CATEGORIES.map(cat => {
                        const active = (addTgUserForm.notify_categories || []).includes(cat.value)
                        return (
                          <button
                            key={cat.value}
                            type="button"
                            onClick={() => {
                              const cats = addTgUserForm.notify_categories || []
                              setAddTgUserForm({
                                ...addTgUserForm,
                                notify_categories: active ? cats.filter(c => c !== cat.value) : [...cats, cat.value]
                              })
                            }}
                            style={{
                              padding: '8px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 12,
                              textAlign: 'center',
                              border: `1px solid ${active ? '#38bdf8' : '#1e293b'}`,
                              background: active ? 'rgba(56, 189, 248, 0.15)' : '#090d16',
                              color: active ? '#38bdf8' : '#64748b'
                            }}
                          >
                            {active ? '✓ ' : '○ '} {cat.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={() => setShowAddTgUser(false)}
                      style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      disabled={addTgUserSaving}
                      onClick={handleAddTgUser}
                      style={btnPrimaryStyle}
                    >
                      {addTgUserSaving ? 'Сохранение...' : 'Добавить'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ TELEGRAM SEND MESSAGE MODAL ============ */}
          {tgSendModal && (
            <div style={modalOverlayStyle} onClick={() => setTgSendModal(null)}>
              <div style={{ ...modalCardStyle, maxWidth: 440 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Send size={16} color="#38bdf8" />
                    Личное оповещение
                  </h3>
                  <button onClick={() => setTgSendModal(null)} style={closeBtnStyle}>
                    <X size={18} />
                  </button>
                </div>

                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                  Получатель:{' '}
                  <b style={{ color: '#fff' }}>
                    {tgSendModal.first_name || tgSendModal.username || tgSendModal.telegram_id}
                  </b>
                </div>

                <textarea
                  rows={4}
                  value={tgSendMsg}
                  onChange={e => setTgSendMsg(e.target.value)}
                  placeholder="Введите сообщение..."
                  style={{ ...modernInputStyle, width: '100%', marginBottom: 12, resize: 'vertical' }}
                />

                {tgSendResult && (
                  <div
                    style={{
                      fontSize: 12,
                      marginBottom: 12,
                      padding: '8px 12px',
                      borderRadius: 6,
                      background: tgSendResult.sent ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      border: `1px solid ${tgSendResult.sent ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      color: tgSendResult.sent ? '#4ade80' : '#f87171',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    {tgSendResult.sent ? <Check size={16} /> : <AlertTriangle size={16} />}
                    {tgSendResult.sent ? 'Сообщение отправлено!' : `Ошибка: ${tgSendResult.error || 'Сбой'}`}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setTgSendModal(null)}
                    style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}
                  >
                    Закрыть
                  </button>
                  <button
                    type="button"
                    disabled={tgSending || !tgSendMsg.trim()}
                    onClick={handleTgSend}
                    style={btnPrimaryStyle}
                  >
                    <Send size={14} />
                    {tgSending ? 'Отправка...' : 'Отправить'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  )
}

const modernInputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid #1e293b',
  background: '#090d16',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box'
}

const btnPrimaryStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 18px',
  borderRadius: 8,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
  transition: 'all 0.15s ease'
}

const actionBtnStyle = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid #1e293b',
  background: '#090d16',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  transition: 'border-color 0.15s ease'
}

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(4px)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16
}

const modalCardStyle = {
  width: '100%',
  maxWidth: 520,
  maxHeight: '90vh',
  overflowY: 'auto',
  background: '#101726',
  border: '1px solid #1e293b',
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
}

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  padding: 4
}

const errorBannerStyle = {
  marginBottom: 20,
  padding: '12px 16px',
  background: 'rgba(239, 68, 68, 0.1)',
  border: '1px solid rgba(239, 68, 68, 0.3)',
  borderRadius: 8,
  color: '#f87171',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 10
}

const loadingCardStyle = {
  padding: 60,
  textAlign: 'center',
  background: '#101726',
  border: '1px solid #1e293b',
  borderRadius: 12,
  color: '#94a3b8'
}

const emptyCardStyle = {
  padding: 60,
  textAlign: 'center',
  background: '#101726',
  border: '1px solid #1e293b',
  borderRadius: 12
}

const emptyIconContainer = {
  width: 56,
  height: 56,
  borderRadius: 16,
  background: 'rgba(56, 189, 248, 0.1)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto 16px'
}
