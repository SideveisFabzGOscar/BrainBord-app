'use client';

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { GROUP_META, type ColorGroup } from '@/lib/meta';

const axis = { fontSize: 11, fill: 'rgb(var(--muted))' };
const tooltipStyle = {
  contentStyle: { background: 'rgb(var(--panel))', border: '1px solid rgb(var(--line))', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: 'rgb(var(--ink))', fontWeight: 600 },
  cursor: { fill: 'rgb(var(--ink) / 0.04)' },
};

/** Arbeidsmengde per uke, stablet etter aktivitetsgruppe */
export function WorkloadChart({ data }: { data: ({ week: string } & Partial<Record<ColorGroup, number>>)[] }) {
  const groups = (Object.keys(GROUP_META) as ColorGroup[]).filter((g) => data.some((d) => d[g]));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
        <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {groups.map((g, i) => (
          <Bar key={g} dataKey={g} name={GROUP_META[g].label} stackId="a" fill={GROUP_META[g].hex}
            radius={i === groups.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AbsenceDonut({ documented, undocumented }: { documented: number; undocumented: number }) {
  const data = [
    { name: 'Dokumentert', value: documented, color: '#10b981' },
    { name: 'Udokumentert', value: undocumented, color: '#f43f5e' },
  ];
  const total = documented + undocumented;
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={58} outerRadius={80} paddingAngle={total ? 2 : 0} stroke="none">
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip {...tooltipStyle} formatter={(v: number) => `${v} t`} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div><div className="text-2xl font-semibold tabular-nums">{total}</div><div className="text-xs text-muted">timer</div></div>
      </div>
    </div>
  );
}

export function HorizontalBars({ data, unit = 't' }: { data: { name: string; hours: number }[]; unit?: string }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={130} tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => `${v} ${unit}`} />
        <Bar dataKey="hours" name="Fravær" fill="rgb(var(--accent))" radius={[0, 4, 4, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MonthlyAbsence({ data }: { data: { month: string; documented: number; undocumented: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="rgb(var(--line))" />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => `${v} t`} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="documented" name="Dokumentert" stackId="a" fill="#10b981" maxBarSize={36} />
        <Bar dataKey="undocumented" name="Udokumentert" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
