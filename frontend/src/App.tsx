import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DashboardView } from './pages/DashboardView';
import { SearchView } from './pages/SearchView';
import { HeadedDemoView } from './pages/HeadedDemoView';
import { ProductDetailModal } from './components/ProductDetailModal';
import type { TrackedProduct, StoreProduct } from './types';
import { api } from './api/client';
import { AlertCircle } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'search' | 'headed'>('dashboard');
  const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>([]);
  const [healthStatus, setHealthStatus] = useState<'online' | 'waking' | 'offline'>('waking');
  const [selectedProduct, setSelectedProduct] = useState<TrackedProduct | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let timer: NodeJS.Timeout;

    const pollHealth = async () => {
      try {
        await api.checkHealth();
        if (!mounted) return;
        setHealthStatus('online');
        loadTracked();
        // When online, check periodically every 30 seconds
        timer = setTimeout(pollHealth, 30000);
      } catch (err) {
        if (!mounted) return;
        setHealthStatus('waking');
        // When waking/cold starting, retry quickly every 4 seconds!
        timer = setTimeout(pollHealth, 4000);
      }
    };

    pollHealth();

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  const loadTracked = async () => {
    try {
      const items = await api.getTrackedProducts();
      setTrackedProducts(items || []);
    } catch (err) {
      console.error('Failed to load tracked products:', err);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleTrack = async (product: StoreProduct) => {
    try {
      const newTracked = await api.trackProduct({
        store_product_id: product.id,
        name: product.name,
        category: product.category,
        brand: product.brand,
        sku: product.sku,
        description: product.description
      });
      setTrackedProducts((prev) => [newTracked, ...prev.filter((p) => p.store_product_id !== product.id)]);
      showToast(`Now tracking "${product.name}". Initial scrape running...`);
      // Reload after short delay so initial scrape outcome displays
      setTimeout(() => loadTracked(), 4000);
    } catch (err: any) {
      alert(`Failed to track product: ${err.message}`);
    }
  };

  const handleUntrack = async (id: string) => {
    try {
      await api.untrackProduct(id);
      setTrackedProducts((prev) => prev.filter((p) => p.id !== id));
      if (selectedProduct?.id === id) {
        setSelectedProduct(null);
      }
      showToast('Product removed from tracking.');
    } catch (err: any) {
      alert(`Failed to untrack product: ${err.message}`);
    }
  };

  const handleManualScrape = async (id: string) => {
    try {
      const res = await api.triggerScrape(id);
      await loadTracked();
      const outcome = res.result?.outcome || 'complete';
      showToast(`Scrape ${outcome}! Price: ₹${res.result?.price || '—'}`);
    } catch (err: any) {
      showToast(`Scrape error: ${err.message}`);
    }
  };

  return (
    <div className="app-container">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        trackedCount={trackedProducts.length}
        healthStatus={healthStatus}
      />

      {/* Backend Waking Banner for Render Cold Starts */}
      {healthStatus === 'waking' && (
        <div className="cold-start-banner">
          <AlertCircle size={18} />
          <div>
            <strong>Connecting to backend...</strong> Free-tier cloud instances (Render) sleep when idle and may take 30–60 seconds to cold start. Retrying automatically.
          </div>
        </div>
      )}

      {/* Main Views */}
      <main>
        {activeTab === 'dashboard' && (
          <DashboardView
            products={trackedProducts}
            onOpenDetail={(prod) => setSelectedProduct(prod)}
            onScrapeNow={handleManualScrape}
            onUntrack={handleUntrack}
            onGoToSearch={() => setActiveTab('search')}
          />
        )}

        {activeTab === 'search' && (
          <SearchView
            trackedProducts={trackedProducts}
            onTrackProduct={handleTrack}
          />
        )}

        {activeTab === 'headed' && <HeadedDemoView />}
      </main>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onScrapeNow={handleManualScrape}
        />
      )}

      {/* Toast notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid var(--border-active)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 20px',
            fontSize: '0.88rem',
            fontWeight: 600,
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease'
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default App;
