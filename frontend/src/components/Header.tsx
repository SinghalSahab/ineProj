import React from 'react';
import { Activity, Search, LayoutDashboard, Terminal } from 'lucide-react';

interface HeaderProps {
  activeTab: 'dashboard' | 'search' | 'headed';
  setActiveTab: (tab: 'dashboard' | 'search' | 'headed') => void;
  trackedCount: number;
  healthStatus: 'online' | 'waking' | 'offline';
  uptimeSeconds?: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  trackedCount,
  healthStatus
}) => {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-icon">
          <Activity size={22} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="brand-title">INE Price Tracker</span>
            <span className="brand-badge">Mock Store Scraper</span>
          </div>
        </div>
      </div>

      <nav className="nav-tabs">
        <button
          className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard size={16} />
          Dashboard
          {trackedCount > 0 && (
            <span style={{
              background: 'rgba(99, 102, 241, 0.2)',
              padding: '1px 6px',
              borderRadius: '999px',
              fontSize: '0.72rem'
            }}>
              {trackedCount}
            </span>
          )}
        </button>
        <button
          className={`nav-tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <Search size={16} />
          Search Store
        </button>
        <button
          className={`nav-tab ${activeTab === 'headed' ? 'active' : ''}`}
          onClick={() => setActiveTab('headed')}
        >
          <Terminal size={16} />
          CLI & Headed Mode
        </button>
      </nav>

      <div className="header-status">
        <span className={`status-dot ${healthStatus}`} />
        <span style={{ fontWeight: 600, color: healthStatus === 'online' ? 'var(--success)' : healthStatus === 'waking' ? 'var(--warning)' : 'var(--danger)' }}>
          {healthStatus === 'online' ? 'Backend Live' : healthStatus === 'waking' ? 'Waking Up...' : 'Offline'}
        </span>
      </div>
    </header>
  );
};
