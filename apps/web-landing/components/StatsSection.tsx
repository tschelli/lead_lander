export type Stats = {
  placementRate?: string;
  avgSalary?: string;
  duration?: string;
  graduationRate?: string;
};

export function StatsSection({ stats }: { stats: Stats }) {
  const statItems = [
    { label: "Placement Rate", value: stats.placementRate },
    { label: "Average Salary", value: stats.avgSalary },
    { label: "Program Duration", value: stats.duration },
    { label: "Graduation Rate", value: stats.graduationRate }
  ].filter((item) => item.value);

  if (statItems.length === 0) return null;

  return (
    <section className="stats-section">
      <div className="stats-grid">
        {statItems.map((stat, i) => (
          <div key={i} className="stat-item">
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
