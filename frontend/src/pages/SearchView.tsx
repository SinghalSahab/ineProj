import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, Plus, Check, ExternalLink } from 'lucide-react';
import type { StoreProduct, TrackedProduct } from '../types';
import { api } from '../api/client';

interface SearchViewProps {
  trackedProducts: TrackedProduct[];
  onTrackProduct: (product: StoreProduct) => Promise<void>;
}

const CATEGORIES = ['All', 'Monitors', 'Laptops', 'Smart Home', 'Audio', 'Peripherals', 'Kitchen', 'Bags'];

export const SearchView: React.FC<SearchViewProps> = ({ trackedProducts, onTrackProduct }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [results, setResults] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [trackingId, setTrackingId] = useState<number | null>(null);

  // Set of tracked store_product_ids
  const trackedStoreIds = new Set(trackedProducts.map((p) => p.store_product_id));

  useEffect(() => {
    const timer = setTimeout(() => {
      search();
    }, 300);
    return () => clearTimeout(timer);
  }, [query, category]);

  const search = async () => {
    setLoading(true);
    try {
      const res = await api.searchStore(query);
      let items = res.items || [];
      if (category !== 'All') {
        items = items.filter((i) => (i.category || '').toLowerCase() === category.toLowerCase());
      }
      setResults(items);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrack = async (product: StoreProduct) => {
    setTrackingId(product.id);
    try {
      await onTrackProduct(product);
    } finally {
      setTrackingId(null);
    }
  };

  return (
    <div className="search-container">
      {/* Search Input Bar */}
      <div className="search-input-wrap">
        <SearchIcon className="search-icon" size={20} />
        <input
          type="text"
          className="search-input"
          placeholder="Search INE mock store by product name, brand, category, or SKU (e.g., Meridian, Monitor, Larkspur)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* Category Pills */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`btn btn-sm ${category === cat ? 'btn-primary' : 'btn-secondary'}`}
            style={{ whiteSpace: 'nowrap' }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {loading ? 'Searching store...' : `Found ${results.length} products`}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <span style={{ color: 'var(--text-muted)' }}>Fetching from INE mock storefront...</span>
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <p>No products match "{query}". Try a different search term.</p>
          </div>
        ) : (
          <div className="products-grid">
            {results.map((product) => {
              const isAlreadyTracked = trackedStoreIds.has(product.id);
              const isTrackingThis = trackingId === product.id;

              return (
                <div key={product.id} className="product-card">
                  <div>
                    <div className="card-top">
                      <span className="card-category">{product.category}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        SKU: {product.sku}
                      </span>
                    </div>

                    <h3 className="card-title" style={{ minHeight: 'auto', marginBottom: 8 }}>
                      {product.name}
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.4 }}>
                      {product.description}
                    </p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                    <a
                      href={`https://demo.inelabteamdev.com/product/${product.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--text-muted)',
                        fontSize: '0.78rem',
                        textDecoration: 'none'
                      }}
                    >
                      Store Listing <ExternalLink size={12} />
                    </a>

                    {isAlreadyTracked ? (
                      <span
                        className="btn btn-sm"
                        style={{ background: 'var(--bg-subtle)', color: 'var(--success)', cursor: 'default' }}
                      >
                        <Check size={14} /> Already Tracked
                      </span>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => handleTrack(product)}
                        disabled={isTrackingThis}
                      >
                        <Plus size={14} className={isTrackingThis ? 'spinner' : ''} />
                        {isTrackingThis ? 'Tracking...' : 'Track Price'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
