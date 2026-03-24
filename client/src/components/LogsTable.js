function LogsTable({ logs }) {
  if (!logs.length) return (
    <div style={{ padding: '20px', color: '#718096', fontSize: '13px' }}>
      No requests yet. Send a prompt above.
    </div>
  );

  return (
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Prompt</th>
          <th>Model</th>
          <th>Status</th>
          <th>Tokens</th>
          <th>Latency</th>
        </tr>
      </thead>
      <tbody>
        {logs.map(log => (
          <tr key={log._id}>
            <td>{new Date(log.timestamp).toLocaleTimeString()}</td>
            <td className="prompt-cell" title={log.prompt}>{log.prompt}</td>
            <td style={{ color: '#63b3ed' }}>{log.modelSelected}</td>
            <td>
              {log.blocked
                ? <span className="badge blocked">BLOCKED</span>
                : log.usedFallback
                ? <span className="badge fallback">FALLBACK</span>
                : <span className="badge success">OK</span>}
            </td>
            <td>{log.totalTokens || '—'}</td>
            <td>{log.latencyMs}ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default LogsTable;