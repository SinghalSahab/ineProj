import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { ScrapeLogItem, ScrapeOutcome } from '../types';

interface ScrapeLogTableProps {
  logs: ScrapeLogItem[];
}

export const ScrapeLogTable: React.FC<ScrapeLogTableProps> = ({ logs }) => {
  const [filter, setFilter] = useState<'all' | ScrapeOutcome>('all');

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.outcome === filter;
  });

  const counts = {
    all: logs.length,
    success: logs.filter((l) => l.outcome === 'success').length,
    retried: logs.filter((l) => l.outcome === 'retried').length,
    failed: logs.filter((l) => l.outcome === 'failed').length
  };

  const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Scrape Audit Log</h4>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'success', 'retried', 'failed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
              style={{ textTransform: 'capitalize' }}
            >
              {f} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Trigger</th>
              <th>Outcome</th>
              <th>Attempts</th>
              <th>Duration</th>
              <th>Status</th>
              <th>Details & Errors</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  No scrape logs matching filter "{filter}".
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td className="tabular" style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                    {formatTimestamp(log.started_at)}
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '2px 8px',
                        background: 'var(--bg-subtle)',
                        borderRadius: 4,
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}
                    >
                      {log.trigger}
                    </span>
                  </td>
                  <td>
                    <span className={`badge-outcome ${log.outcome}`}>
                      {log.outcome === 'success' ? (
                        <CheckCircle2 size={12} />
                      ) : log.outcome === 'retried' ? (
                        <AlertTriangle size={12} />
                      ) : (
                        <XCircle size={12} />
                      )}
                      {log.outcome}
                    </span>
                  </td>
                  <td className="tabular">{log.attempts}/4</td>
                  <td className="tabular">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                  <td className="tabular">{log.http_status || '200'}</td>
                  <td>
                    {log.outcome === 'failed' ? (
                      <span style={{ color: 'var(--danger)', fontWeight: 600, fontSize: '0.78rem' }}>
                        [{log.error_type || 'error'}] {log.error_message || 'Attempt failed'}
                      </span>
                    ) : log.outcome === 'retried' ? (
                      <span style={{ color: 'var(--warning)', fontSize: '0.78rem' }}>
                        Recovered after retry ({log.attempts} attempts)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--success)', fontSize: '0.78rem' }}>
                        Price validated: ₹{log.extracted_price}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
