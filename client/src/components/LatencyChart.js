import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function LatencyChart({ logs }) {
  const data = [...logs]
    .reverse()
    .slice(-15)
    .map((log, i) => ({
      name: i + 1,
      latency: log.latencyMs,
      blocked: log.blocked
    }));

  return (
    <div style={{ padding: '20px' }}>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
          <XAxis dataKey="name" stroke="#718096" tick={{ fontSize: 11 }} />
          <YAxis stroke="#718096" tick={{ fontSize: 11 }} unit="ms" />
          <Tooltip
            contentStyle={{ background: '#1a1d2e', border: '1px solid #2d3748', fontSize: '12px' }}
            labelStyle={{ color: '#a0aec0' }}
          />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#63b3ed"
            strokeWidth={2}
            dot={{ fill: '#63b3ed', r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default LatencyChart;