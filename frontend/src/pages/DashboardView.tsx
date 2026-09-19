import React from 'react';
import { PlusCircle, ShoppingBag, ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';
import type { TrackedProduct } from '../types';
import { ProductCard } from '../components/ProductCard';

interface DashboardViewProps {
  products: TrackedProduct[];
  onOpenDetail: (product: TrackedProduct) => void;
  onScrapeNow: (id: string) => Promise<void>;
  onUntrack: (id: string) => Promise<void>;
  onGoToSearch: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  products,
  onOpenDetail,
  onScrapeNow,
  onUntrack,
  onGoToSearch
}) => {
  const healthyCount = products.filter((p) => !p.health || p.health === 'healthy').length;
  const retryingCount = products.filter((p) => p.health === 'retrying').length;
  const failingCount = products.filter((p) => p.health === 'failing').length;

  return (
    <div>
      {/* Metrics Row */}
      <div className="metrics-row">
        <div className="metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label">Tracked Items</span>
            <ShoppingBag size={18} color="var(--primary)" />
          </div>
          <span className="metric-value">{products.length}</span>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label">Healthy Scrapes</span>
            <ShieldCheck size={18} color="var(--success)" />
          </div>
          <span className="metric-value" style={{ color: 'var(--success)' }}>
            {healthyCount}
          </span>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label">Retrying / Recovering</span>
            <AlertTriangle size={18} color="var(--warning)" />
          </div>
          <span className="metric-value" style={{ color: 'var(--warning)' }}>
            {retryingCount}
          </span>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="metric-label">Failing</span>
            <XCircle size={18} color="var(--danger)" />
          </div>
          <span className="metric-value" style={{ color: 'var(--danger)' }}>
            {failingCount}
          </span>
        </div>
      </div>

      {/* Grid of Tracked Products */}
      {products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <ShoppingBag size={48} strokeWidth={1.5} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8, color: '#f8fafc' }}>
            No products currently tracked
          </h3>
          <p style={{ maxWidth: 460, marginBottom: 20 }}>
            Search INE's mock storefront for laptops, monitors, smart home devices, or audio gear to begin scheduled price tracking.
          </p>
          <button className="btn btn-primary" onClick={onGoToSearch}>
            <PlusCircle size={16} />
            Search & Track Products
          </button>
        </div>
      ) : (
        <div className="products-grid">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onOpenDetail={onOpenDetail}
              onScrapeNow={onScrapeNow}
              onUntrack={onUntrack}
            />
          ))}
        </div>
      )}
    </div>
  );
};
