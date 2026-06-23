"use client";

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export interface PieSlice {
  name: string;
  value: number;
}

interface AllocationPieChartProps {
  data: PieSlice[];
  colors: string[];
  assetLabels: string[];
}

export default function AllocationPieChart({ data, colors, assetLabels }: AllocationPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={60} outerRadius={100} dataKey="value">
          {data.map((entry, i) => (
            <Cell key={i} fill={colors[assetLabels.indexOf(entry.name)]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => `${v}%`} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
