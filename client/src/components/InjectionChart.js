import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts';

function InjectionChart({ logs }) {
  // Take last 20 requests, oldest first
  const recent = [...logs].reverse().slice(-20);

  // Build per-request bars: each bar is one request coloured by status
  const data = recent.map((log, i) => ({
    name: i + 1,
    status: log.blocked ? 'Blocked' : log.flagged ? 'Flagged' : 'Safe',
    riskScore: parseFloat((log.riskScore || 0).toFixed(2)),
    reason: log.injectionReason || 'none',
    prompt: log.prompt?.substring(0, 30) + (log.prompt?.length > 30 ? '…' : ''),
  }));

  // Summary counts for the legend strip
  const blocked = data.filter(d => d.status === 'Blocked').length;
  const flagged = data.filter(d => d.status === 'Flagged').length;
  const safe = data.filter(d => d.status === 'Safe').length;

  const COLOR = { Blocked: '#fc8181', Flagged: '#f6ad55', Safe: '#68d391' };

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div style={{
        background: '#1a1d2e', border: '1px solid #2d3748',
        padding: '10px 14px', borderRadius: 6, fontSize: 12
      }}>
        <div style={{ color: COLOR[d.status], fontWeight: 600, marginBottom: 4 }}>
          {d.status === 'Blocked' ? '🚫' : d.status === 'Flagged' ? '⚠️' : '✅'} {d.status}
        </div>
        <div style={{ color: '#a0aec0' }}>Risk score: <span style={{ color: '#fff' }}>{d.riskScore}</span></div>
        {d.reason !== 'none' && (
          <div style={{ color: '#a0aec0' }}>Reason: <span style={{ color: '#fc8181' }}>{d.reason}</span></div>
        )}
        <div style={{ color: '#a0aec0', marginTop: 4 }}>"{d.prompt}"</div>
      </div>
    );
  };

  if (!data.length) return (
    <div style={{ padding: '20px', color: '#718096', fontSize: '13px' }}>
      No data yet. Send some prompts above.
    </div>
  );

  return (
    <div style={{ padding: '20px' }}>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: 13 }}>
        <span style={{ color: '#fc8181' }}>🚫 Blocked: <strong>{blocked}</strong></span>
        <span style={{ color: '#f6ad55' }}>⚠️ Flagged: <strong>{flagged}</strong></span>
        <span style={{ color: '#68d391' }}>✅ Safe: <strong>{safe}</strong></span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barSize={16}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
          <XAxis dataKey="name" stroke="#718096" tick={{ fontSize: 11 }} />
          <YAxis
            stroke="#718096"
            tick={{ fontSize: 11 }}
            domain={[0, 1]}
            tickCount={3}
            label={{ value: 'Risk', angle: -90, position: 'insideLeft', fill: '#718096', fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="riskScore" radius={[3, 3, 0, 0]}>
            {data.map((entry, index) => (
              <Cell key={index} fill={COLOR[entry.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default InjectionChart;