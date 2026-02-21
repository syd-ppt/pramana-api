import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DriftChartProps {
  data: Array<{
    date: string;
    [key: string]: string | number;
  }>;
  models: string[];
}

const COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed'];

export default function DriftChart({ data, models }: DriftChartProps) {
  return (
    <div className="w-full bg-white p-4 sm:p-6 rounded-lg shadow-sm">
      <h2 className="text-xl font-bold mb-4 text-slate-900">Model Performance Over Time</h2>
      <div className="w-full h-64 sm:h-80 lg:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis domain={[0, 1]} label={{ value: 'Pass Rate', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            {models.map((model, idx) => (
              <Line
                key={model}
                type="monotone"
                dataKey={model}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
