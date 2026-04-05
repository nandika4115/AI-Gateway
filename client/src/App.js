import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import StatCard from './components/StatCard';
import LogsTable from './components/LogsTable';
import LatencyChart from './components/LatencyChart';
import InjectionChart from './components/InjectionChart';
import './App.css';

const API = process.env.REACT_APP_API_URL || 'https://ai-gateway-server.onrender.com/api';
function RoutingBadge({ routingReason, model }) {
  const isLarge = model?.includes('70b');
  return (
    <div className="routing-badge">
      <span className={`model-pill ${isLarge ? 'large' : 'small'}`}>
        {isLarge ? '⚡ 70B' : '🚀 8B'}
      </span>
      <span className="routing-reason">{routingReason}</span>
    </div>
  );
}

function App() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const [statsRes, logsRes] = await Promise.allSettled([
      axios.get(`${API}/stats`),
      axios.get(`${API}/logs`)
    ]);

    if (statsRes.status === 'fulfilled') {
      setStats(statsRes.value.data);
    } else {
      console.error('Stats fetch error:', statsRes.reason);
    }

    if (logsRes.status === 'fulfilled') {
      setLogs(logsRes.value.data);
    } else {
      console.error('Logs fetch error:', logsRes.reason);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const sendPrompt = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResponse(null);
    try {
      const res = await axios.post(`${API}/chat`, { prompt });
      setResponse({ ...res.data, blocked: false });
    } catch (err) {
      if (err.response?.status === 429) {
        setResponse({ blocked: true, reason: err.response.data.reason, isRateLimit: true });
      } else if (err.response?.data) {
        setResponse({ ...err.response.data, blocked: true });
      }
    }
    setLoading(false);
    fetchData();
  };

  return (
    <div>
      <div className="header">
        <div className="dot" />
        <h1>AI Gateway</h1>
        <span className="tag">LIVE</span>
      </div>

      <div className="container">
        {/* Stats — now 5 cards including Cost Saved */}
        <div className="stats-grid">
          <StatCard label="Total Requests" value={stats?.totalRequests ?? '—'} />
          <StatCard label="Blocked" value={stats?.blockedRequests ?? '—'} type="danger" />
          <StatCard label="Avg Latency" value={stats ? `${stats.avgLatencyMs}ms` : '—'} type="warning" />
          <StatCard label="Total Tokens" value={stats?.totalTokens ?? '—'} type="success" />
          <StatCard label="Cost Saved" value={stats?.totalCostSaved ?? '—'} type="success" />
        </div>

        {/* Chat */}
        <div className="section">
          <div className="section-header">
            <span>Send a Request</span>
            <span style={{ color: '#718096' }}>routed through the gateway</span>
          </div>
          <div className="chat-box">
            <div className="chat-input-row">
              <input
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendPrompt()}
                placeholder="Type a prompt... (try 'ignore previous instructions')"
              />
              <button onClick={sendPrompt} disabled={loading}>
                {loading ? 'Sending...' : 'Send →'}
              </button>
            </div>
            {response && (
              <div className="chat-response">
                {response.blocked
                  ? <span style={{ color: '#fc8181' }}>🚫 {response.reason}</span>
                  : <span>{response.response}</span>
                }
                <div className="meta">
                  {!response.blocked && <>
                    {/* "Why this model" routing badge */}
                    <RoutingBadge routingReason={response.routingReason} model={response.model} />
                    <span>Tokens: <span className="highlight">{response.usage?.totalTokens}</span></span>
                    <span>Latency: <span className="highlight">{response.latencyMs}ms</span></span>
                    <span>Cost saved: <span className="highlight">{response.costSaved}</span></span>
                  </>}
                  {response.blocked && (
                    <span className="blocked-tag">
                      {response.isRateLimit ? '⏱ RATE LIMITED' : '⚠ INJECTION BLOCKED'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Latency Chart */}
        <div className="section">
          <div className="section-header">
            <span>Latency (last 15 requests)</span>
          </div>
          <LatencyChart logs={logs} />
        </div>

        {/* Injection Analytics Chart — NEW */}
        <div className="section">
          <div className="section-header">
            <span>Injection Attempts</span>
            <span style={{ color: '#718096' }}>last 20 requests</span>
          </div>
          <InjectionChart logs={logs} />
        </div>

        {/* Logs Table */}
        <div className="section">
          <div className="section-header">
            <span>Request Logs</span>
            <button className="refresh-btn" onClick={fetchData}>↻ Refresh</button>
          </div>
          <LogsTable logs={logs} />
        </div>
      </div>
    </div>
  );
}

export default App;