import React, { useState } from 'react';
import { Terminal, Copy, Check, ShieldAlert, CheckCircle } from 'lucide-react';

export const HeadedDemoView: React.FC = () => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const commands = [
    {
      title: '1. Standard Observable Headed Run',
      desc: 'Spawns a visible Chromium browser on your screen with slow-motion (150ms), logs real-time mouse dwell/movements, reveals the price, and updates the database.',
      cmd: 'npm run scrape:headed -- --product 748'
    },
    {
      title: '2. Fault Injection Demo (--simulate-fail)',
      desc: 'Injects an artificial HTTP 500 error on attempt 1. Demonstrates the scraper catching the failure, logging an honest attempt, backing off with jitter, and recovering successfully on attempt 2.',
      cmd: 'npm run scrape:headed -- --product 748 --simulate-fail --dry-run'
    },
    {
      title: '3. Slow Network Response Demo (--simulate-slow)',
      desc: 'Injects an artificial 3000ms network delay on price response. Demonstrates how the scraper waits for async decryption rather than reading premature skeleton states.',
      cmd: 'npm run scrape:headed -- --product 748 --simulate-slow --dry-run'
    },
    {
      title: '4. Safe Dry-Run Console Mode',
      desc: 'Executes the complete Playwright browser flow and prints all parsed and validated fields to stdout without touching the database.',
      cmd: 'npm run scrape:headed -- --product 549 --dry-run'
    }
  ];

  return (
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div className="brand-icon" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <Terminal size={20} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Observable Headed Scraper Mode</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5 }}>
          For screen recording and live video interviews, the scraper can be launched in <strong>headed mode</strong>. You can watch Playwright navigate, hover over the price box, satisfy the mouse movement telemetry, click "Reveal price", decrypt the payload, and honestly record each attempt.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {commands.map((c, i) => (
          <div key={i} className="metric-card" style={{ padding: 22 }}>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 6, color: '#f8fafc' }}>
              {c.title}
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>
              {c.desc}
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#070a10',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 16px',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.85rem'
              }}
            >
              <span style={{ color: '#818cf8', userSelect: 'all' }}>{c.cmd}</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => copyToClipboard(c.cmd)}
                style={{ marginLeft: 12, flexShrink: 0 }}
              >
                {copiedCmd === c.cmd ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                {copiedCmd === c.cmd ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Highlights Box */}
      <div
        style={{
          marginTop: 32,
          padding: 24,
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)'
        }}
      >
        <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldAlert size={18} color="var(--warning)" />
          Key Reliability Pillars Demonstrated
        </h4>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <CheckCircle size={15} color="var(--success)" style={{ marginTop: 2, flexShrink: 0 }} />
            <span><strong>Zero Fake Data Rule:</strong> Failures write an honest <code>scrape_logs</code> row and NEVER write a <code>price_history</code> row.</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <CheckCircle size={15} color="var(--success)" style={{ marginTop: 2, flexShrink: 0 }} />
            <span><strong>Anti-Scraping Bypass:</strong> Simulates human mouse dwell (&gt;600ms) and trajectory movements (&gt;8 moves) to satisfy client-side telemetry.</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <CheckCircle size={15} color="var(--success)" style={{ marginTop: 2, flexShrink: 0 }} />
            <span><strong>Decoy Element Rejection:</strong> Strips hidden decoy spans (e.g. <code>.amount[data-price="true"]</code>) and extracts visible typography only.</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
