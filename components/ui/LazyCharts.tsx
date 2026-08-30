'use client';

import React, { useState, useEffect } from 'react';

export interface PaymentTrendChartProps {
  data: Array<{ date: string; amount: number }>;
}

export function PaymentTrendChart({ data }: PaymentTrendChartProps) {
  const [recharts, setRecharts] = useState<any>(null);

  useEffect(() => {
    import('recharts').then(setRecharts).catch(err => console.error('Failed to load Recharts:', err));
  }, []);

  if (!recharts) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-xs">Loading chart...</div>;
  }

  const { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } = recharts;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} />
        <YAxis stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
            borderRadius: '8px',
            color: 'var(--foreground)',
          }}
        />
        <Area
          type="monotone"
          dataKey="amount"
          name="Collected (₹)"
          stroke="var(--primary)"
          fillOpacity={1}
          fill="url(#colorRevenue)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface TransactionBreakdownChartProps {
  data: Array<{ name: string; value: number }>;
  colors: Record<string, string>;
}

export function TransactionBreakdownChart({ data, colors }: TransactionBreakdownChartProps) {
  const [recharts, setRecharts] = useState<any>(null);

  useEffect(() => {
    import('recharts').then(setRecharts).catch(err => console.error('Failed to load Recharts:', err));
  }, []);

  if (!recharts) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-xs">Loading chart...</div>;
  }

  const { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } = recharts;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={36}
          outerRadius={52}
          paddingAngle={4}
          dataKey="value"
        >
          {data.map((entry: any) => (
            <Cell key={`cell-${entry.name}`} fill={colors[entry.name] || '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            borderColor: 'var(--border)',
            borderRadius: '8px',
            color: 'var(--foreground)',
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export interface OrganizationsGrowthChartProps {
  data: Array<{ week: string; orgs: number }>;
}

export function OrganizationsGrowthChart({ data }: OrganizationsGrowthChartProps) {
  const [recharts, setRecharts] = useState<any>(null);

  useEffect(() => {
    import('recharts').then(setRecharts).catch(err => console.error('Failed to load Recharts:', err));
  }, []);

  if (!recharts) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-xs">Loading chart...</div>;
  }

  const { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } = recharts;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
        <defs>
          <linearGradient id="colorOrgs" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2}/>
            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="week" stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} />
        <YAxis stroke="var(--muted-foreground)" opacity={0.6} tickLine={false} allowDecimals={false} />
        <Tooltip 
          contentStyle={{ 
            background: 'var(--card)', 
            borderColor: 'var(--border)', 
            borderRadius: '8px',
            color: 'var(--foreground)'
          }} 
        />
        <Area type="monotone" dataKey="orgs" name="Signups" stroke="var(--primary)" fillOpacity={1} fill="url(#colorOrgs)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface ContestsStatusChartProps {
  data: Array<{ name: string; value: number; rawStatus: string }>;
  colors: Record<string, string>;
}

export function ContestsStatusChart({ data, colors }: ContestsStatusChartProps) {
  const [recharts, setRecharts] = useState<any>(null);

  useEffect(() => {
    import('recharts').then(setRecharts).catch(err => console.error('Failed to load Recharts:', err));
  }, []);

  if (!recharts) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-xs">Loading chart...</div>;
  }

  const { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } = recharts;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={45}
          outerRadius={65}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry: any) => (
            <Cell key={`cell-${entry.rawStatus}`} fill={colors[entry.rawStatus] || '#94a3b8'} />
          ))}
        </Pie>
        <Tooltip 
          contentStyle={{ 
            background: 'var(--card)', 
            borderColor: 'var(--border)', 
            borderRadius: '8px',
            color: 'var(--foreground)'
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
