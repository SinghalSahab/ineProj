import React, { useState, useEffect } from 'react';
import { X, ExternalLink, RefreshCw, Layers } from 'lucide-react';
import type { TrackedProduct, PriceHistoryItem, ScrapeLogItem } from '../types';
import { PriceChart } from './PriceChart';
import { ScrapeLogTable } from './ScrapeLogTable';
import { api } from '../api/client';

interface ProductDetailModalProps {
  product: TrackedProduct | null;
  onClose: () => void;
  onScrapeNow: (id: string) => Promise<void>;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
  onScrapeNow
}) => {
  const [history, setHistory] = useState<PriceHistoryItem[]>([]);
  const [logs, setLogs] = useState<ScrapeLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);

  useEffect(() => {
    if (!product) return;
    loadDetail();
  }, [product?.id]);

  const loadDetail = async () => {
    if (!product) return;
    setLoading(true);
    try {
      const res = await api.getTrackedProductDetail(product.id);
      setHistory(res.history || []);
      setLogs(res.logs || []);
    } catch (err) {
      console.error('Failed to load product detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualScrape = async () => {
    if (!product) return;
    setScraping(true);
    try {
      await onScrapeNow(product.id);
      await loadDetail();
    } finally {
      setScraping(false);
    }
  };

  if (!product) return null;

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="card-category">{product.category || 'General'}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              SKU: {product.sku || 'N/A'}
            </span>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.3 }}>{product.name}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <a
              href={product.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--primary)',
                fontSize: '0.85rem',
                textDecoration: 'none',
                fontWeight: 600
              }}
            >
              Open on INE Mock Store <ExternalLink size={14} />
            </a>
          </div>
        </div>

        {/* Top Summary Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12,
            padding: 16,
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: 24
          }}
        >
          <div>
            <div className="metric-label">Latest Price</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: 4 }}>
              {formatCurrency(product.last_price)}
            </div>
          </div>
          <div>
            <div className="metric-label">Stock Status</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 4, textTransform: 'capitalize' }}>
              {product.last_stock_status ? product.last_stock_status.replace('_', ' ') : 'Unknown'}
            </div>
          </div>
          <div>
            <div className="metric-label">Scrape Interval</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: 4 }}>
              Every {product.scrape_interval_minutes || 120}m
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary"
              onClick={handleManualScrape}
              disabled={scraping}
            >
              <RefreshCw size={15} className={scraping ? 'spinner' : ''} />
              {scraping ? 'Scraping Store...' : 'Scrape Now'}
            </button>
          </div>
        </div>

        {/* Price History Chart */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={18} color="var(--primary)" />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Price Over Time</h3>
          </div>
          {loading ? (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }} />
              <span style={{ color: 'var(--text-muted)' }}>Loading history...</span>
            </div>
          ) : (
            <PriceChart data={history} />
          )}
        </div>

        {/* Scrape Log Table */}
        <ScrapeLogTable logs={logs} />
      </div>
    </div>
  );
};
