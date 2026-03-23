import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

export function LeaderboardChart({ data }: { data: Array<{ displayName: string; totalScore: number }> }) {
  return (
    <div className="card chart-wrap">
      <h3>점수판</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data.slice(0, 10)}>
          <XAxis dataKey="displayName" hide />
          <YAxis />
          <Bar dataKey="totalScore" fill="#2f80ed" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
