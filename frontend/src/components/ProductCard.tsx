import React, { useState } from 'react';
import { RefreshCw, Trash2, Clock } from 'lucide-react';
import type { TrackedProduct } from '../types';

interface ProductCardProps {
  product: TrackedProduct;
  onOpenDetail: (product: TrackedProduct) => void;
  onScrapeNow: (id: string) => Promise<void>;
  onUntrack: (id: string) => Promise<void>;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onOpenDetail,
  onScrapeNow,
  onUntrack
}) => {
  const [scraping, setScraping] = useState(false);

  const handleScrape = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setScraping(true);
    try {
      await onScrapeNow(product.id);
    } finally {
      setScraping(false);
    }
  };

  const handleUntrack = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Stop tracking "${product.name}"?`)) {
      await onUntrack(product.id);
    }
  };

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const stockBadgeClass =
    product.last_stock_status === 'in_stock'
      ? 'in-stock'
      : product.last_stock_status === 'low_stock'
      ? 'low-stock'
      : product.last_stock_status === 'out_of_stock'
      ? 'out-stock'
      : 'unknown';

  const stockLabel =
    product.last_stock_status === 'in_stock'
      ? 'In Stock'
      : product.last_stock_status === 'low_stock'
      ? 'Low Stock'
      : product.last_stock_status === 'out_of_stock'
      ? 'Out of Stock'
      : 'Unknown';

  return (
    <div className="product-card" onClick={() => onOpenDetail(product)} style={{ cursor: 'pointer' }}>
      <div>
        <div className="card-top">
          <span className="card-category">{product.category || 'General'}</span>
          <div className={`card-health ${product.health || 'healthy'}`}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'currentColor'
              }}
            />
            {product.health === 'failing'
              ? `${product.consecutive_failures} Failures`
              : product.health === 'retrying'
              ? 'Retrying'
              : 'Healthy'}
          </div>
        </div>

        <h3 className="card-title">{product.name}</h3>

        <div className="card-pricing">
          <span className="price-big">{formatCurrency(product.last_price)}</span>
          {product.change24h !== undefined && product.change24h !== 0 && (
            <span className={`price-change ${product.change24h < 0 ? 'down' : 'up'}`}>
              {product.change24h < 0 ? '▼' : '▲'} {Math.abs(product.changePct24h || 0)}% (24h)
            </span>
          )}
        </div>

        <div className="card-stock-row">
          <span className={`stock-badge ${stockBadgeClass}`}>{stockLabel}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
            <Clock size={13} />
            {formatTimeAgo(product.last_scraped_at)}
          </span>
        </div>
      </div>

      <div className="card-actions">
        <button
          className="btn btn-secondary btn-sm"
          style={{ flex: 1 }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(product);
          }}
        >
          History & Logs
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleScrape}
          disabled={scraping}
          title="Trigger immediate live scrape"
        >
          <RefreshCw size={14} className={scraping ? 'spinner' : ''} />
          {scraping ? 'Scraping...' : 'Scrape'}
        </button>
        <button
          className="btn btn-danger btn-sm"
          onClick={handleUntrack}
          title="Untrack product"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};
