import React, { useState, useEffect } from 'react';
import apiFetch from '../lib/api';

export default function HealthCheckPanel({ target, title = 'Health Check' }) {
  const [protocol, setProtocol] = useState('icmp');
  const [multiProtocol, setMultiProtocol] = useState(null);
  const [singleResult, setSingleResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [port, setPort] = useState('');
  const [error, setError] = useState(null);

  const protocols = ['icmp', 'tcp', 'http', 'https', 'dns'];
  const defaultPorts = { tcp: '80', http: '80', https: '443' };

  const handleTestSingleProtocol = async () => {
    if (!target) {
      setError('Target не указан');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ target, protocol });
      if (protocol === 'tcp' && port) qs.set('port', parseInt(port));
      const data = await apiFetch(`/api/health-check/test-protocol?${qs}`, { method: 'POST' });
      setSingleResult(data);
      setMultiProtocol(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestMultiProtocol = async () => {
    if (!target) {
      setError('Target не указан');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(`/api/health-check/multi-protocol?target=${encodeURIComponent(target)}`);
      setMultiProtocol(data);
      setSingleResult(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ok':
      case 'up':
        return '#4ade80';
      case 'degraded':
        return '#f39c12';
      case 'down':
      case 'timeout':
      case 'error':
        return '#ef4444';
      default:
        return '#9aa4b2';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ok':
      case 'up':
        return '✓';
      case 'degraded':
        return '⚠';
      case 'down':
      case 'timeout':
      case 'error':
        return '✕';
      default:
        return '?';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16, background: '#07111e', borderRadius: 8, border: '1px solid #1a2940' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{title}</div>

      {/* Выбор протокола для одной проверки */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#9aa4b2', textTransform: 'uppercase' }}>Проверить протокол</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            disabled={loading}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #1a2940',
              background: '#0d1726',
              color: '#e2e8f0',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {protocols.map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>

          {protocol === 'tcp' && (
            <input
              type="number"
              placeholder="Порт"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              defaultValue={defaultPorts[protocol] || ''}
              disabled={loading}
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px solid #1a2940',
                background: '#0d1726',
                color: '#e2e8f0',
                fontSize: 12,
                maxWidth: 120,
              }}
            />
          )}

          <button
            onClick={handleTestSingleProtocol}
            disabled={loading}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#6c5ce7',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Проверка...' : 'Проверить'}
          </button>
        </div>
      </div>

      {/* Результат одной проверки */}
      {singleResult && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: '#0d1726', borderRadius: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 20, color: getStatusColor(singleResult.status) }}>
              {getStatusIcon(singleResult.status)}
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#9aa4b2' }}>Протокол: {singleResult.protocol}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: getStatusColor(singleResult.status) }}>
                {singleResult.status.toUpperCase()}
              </div>
            </div>
          </div>

          {singleResult.status_code && (
            <div style={{ fontSize: 12, color: '#9aa4b2' }}>
              HTTP Status: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{singleResult.status_code}</span>
            </div>
          )}

          {singleResult.response_time !== null && (
            <div style={{ fontSize: 12, color: '#9aa4b2' }}>
              Response Time: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{singleResult.response_time}ms</span>
            </div>
          )}

          {singleResult.addresses && (
            <div style={{ fontSize: 12, color: '#9aa4b2' }}>
              DNS Addresses: <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{singleResult.addresses.join(', ')}</span>
            </div>
          )}

          {singleResult.error && (
            <div style={{ fontSize: 12, color: '#ef4444' }}>Error: {singleResult.error}</div>
          )}
        </div>
      )}

      {/* Кнопка для проверки всех протоколов */}
      <button
        onClick={handleTestMultiProtocol}
        disabled={loading}
        style={{
          padding: '10px 16px',
          borderRadius: 6,
          border: '1px solid #1a2940',
          background: '#1f2937',
          color: '#9aa4b2',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Проверка всех протоколов...' : 'Проверить все протоколы'}
      </button>

      {/* Результаты всех протоколов */}
      {multiProtocol && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: '#9aa4b2', textTransform: 'uppercase' }}>
            Все протоколы ({multiProtocol.summary.successful}/{multiProtocol.summary.total_checks})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {Object.entries(multiProtocol.checks).map(([name, check]) => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: '#0d1726', borderRadius: 6, borderLeft: `3px solid ${getStatusColor(check.status)}` }}>
                <div style={{ fontSize: 11, color: '#9aa4b2', textTransform: 'uppercase', fontWeight: 600 }}>
                  {name}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: getStatusColor(check.status) }}>
                  {check.status.toUpperCase()}
                </div>
                {check.response_time !== null && (
                  <div style={{ fontSize: 11, color: '#9aa4b2' }}>
                    {check.response_time}ms
                  </div>
                )}
                {check.status_code && (
                  <div style={{ fontSize: 11, color: '#9aa4b2' }}>
                    HTTP {check.status_code}
                  </div>
                )}
                {check.error && (
                  <div style={{ fontSize: 10, color: '#ef4444' }}>
                    {check.error}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ошибка */}
      {error && (
        <div style={{ padding: 12, borderRadius: 6, background: '#be123c22', border: '1px solid #be123c', color: '#f87171', fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
