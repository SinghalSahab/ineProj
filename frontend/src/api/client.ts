/**
 * frontend/src/api/client.ts
 * Type-safe API client for communicating with the backend.
 */

import type {
  TrackedProduct,
  StoreProduct,
  ProductDetailResponse,
  ScrapeOutcome
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!res.ok) {
    let errorMsg = `Request failed: ${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.error || body.message) {
        errorMsg = body.message || body.error;
      }
    } catch {
      // Ignore
    }
    throw new Error(errorMsg);
  }

  return res.json() as Promise<T>;
}

export const api = {
  async checkHealth(): Promise<{ status: string; uptimeSeconds: number; timestamp: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const res = await fetch(`${API_BASE}/api/health`, {
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`Health returned ${res.status}`);
      return res.json();
    } catch (e: any) {
      clearTimeout(timeout);
      throw e;
    }
  },

  async searchStore(query: string): Promise<{ query: string; total: number; items: StoreProduct[] }> {
    return request<{ query: string; total: number; items: StoreProduct[] }>(
      `/api/store/search?q=${encodeURIComponent(query)}`
    );
  },

  async getTrackedProducts(): Promise<TrackedProduct[]> {
    return request<TrackedProduct[]>('/api/tracked');
  },

  async trackProduct(data: {
    store_product_id: number;
    name: string;
    url?: string;
    category?: string;
    brand?: string;
    sku?: string;
    description?: string;
  }): Promise<TrackedProduct> {
    return request<TrackedProduct>('/api/tracked', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async getTrackedProductDetail(
    id: string,
    outcomeFilter?: ScrapeOutcome | 'all'
  ): Promise<ProductDetailResponse> {
    const query = outcomeFilter && outcomeFilter !== 'all' ? `?outcome=${outcomeFilter}` : '';
    return request<ProductDetailResponse>(`/api/tracked/${id}${query}`);
  },

  async triggerScrape(id: string): Promise<{ message: string; result: any }> {
    return request<{ message: string; result: any }>(`/api/tracked/${id}/scrape`, {
      method: 'POST'
    });
  },

  async untrackProduct(id: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/api/tracked/${id}`, {
      method: 'DELETE'
    });
  }
};
