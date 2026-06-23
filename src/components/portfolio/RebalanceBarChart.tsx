"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from "recharts";

export interface RebalChartRow {
  name: string;
  현재: number;
  목표: number;
  color: string;
}

interface RebalanceBarChartProps {
  data: RebalChartRow[];
}

export default function RebalanceBarChart({ data }: RebalanceBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11 }}
          width={72}
        />
        <Tooltip formatter={((v: number | undefined) => [`${v ?? 0}%`]) as any} />
        <Bar dataKey="현재" fill="#cbd5e1" radius={[0, 2, 2, 0]} barSize={10} />
        <Bar dataKey="목표" radius={[0, 2, 2, 0]} barSize={10}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
