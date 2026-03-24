function StatCard({ label, value, type }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className={`value ${type || ''}`}>{value}</div>
    </div>
  );
}

export default StatCard;