import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';

export function PollChart({
  options,
  counts
}: {
  options: string[];
  counts: Array<{ selectedOptionIndex: number; count: number }>;
}) {
  const data = options.map((label, idx) => ({
    label,
    votes: counts.find((c) => c.selectedOptionIndex === idx)?.count ?? 0
  }));

  return (
    <div className="card chart-wrap">
      <h3>투표 결과</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <XAxis dataKey="label" />
          <YAxis />
          <Bar dataKey="votes" fill="#27ae60" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
