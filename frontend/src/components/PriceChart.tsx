import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import type { PriceHistoryItem } from '../types';

interface PriceChartProps {
  data: PriceHistoryItem[];
  currency?: string;
}

export const PriceChart: React.FC<PriceChartProps> = ({ data, currency = 'INR' }) => {
  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '40px 20px' }}>
        <p>No price history recorded yet for this product.</p>
        <span style={{ fontSize: '0.8rem', marginTop: '6px' }}>
          History is recorded only after successful scrapes.
        </span>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    timestamp: new Date(item.scraped_at).getTime(),
    displayTime: new Date(item.scraped_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }),
    price: Number(item.price),
    stock: item.stock_status,
    quantity: item.stock_quantity
  }));

  const prices = chartData.map((d) => d.price);
  const minPrice = Math.floor(Math.min(...prices) * 0.95);
  const maxPrice = Math.ceil(Math.max(...prices) * 1.05);

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div style={{ width: '100%', height: 260, marginTop: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.06)" />
          <XAxis
            dataKey="displayTime"
            stroke="#64748b"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255, 255, 255, 0.08)' }}
          />
          <YAxis
            domain={[minPrice, maxPrice]}
            stroke="#64748b"
            fontSize={11}
            tickFormatter={formatPrice}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255, 255, 255, 0.08)' }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const p = payload[0].payload;
                return (
                  <div
                    style={{
                      background: '#121824',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 8,
                      padding: '10px 14px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>
                      {p.displayTime}
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>
                      {formatPrice(p.price)}
                    </div>
                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: p.stock === 'in_stock' ? '#10b981' : '#f59e0b',
                        marginTop: 4
                      }}
                    >
                      Stock: {p.stock} {p.quantity ? `(${p.quantity} units)` : ''}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke="#6366f1"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#priceGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
