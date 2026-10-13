/**
 * Central API Client for Industrial Safety Backend
 */

export const API_BASE = '/api';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('safety_token');
}

export function setToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('safety_token', token);
  }
}

export function removeToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('safety_token');
    localStorage.removeItem('safety_manager');
  }
}

export function getStoredManager(): any | null {
  if (typeof window === 'undefined') return null;
  const data = localStorage.getItem('safety_manager');
  return data ? JSON.parse(data) : null;
}

export function setStoredManager(mgr: any): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('safety_manager', JSON.stringify(mgr));
  }
}

export async function apiFetch<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Set default JSON Content-Type unless FormData body is provided
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Session expired or unauthenticated
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      removeToken();
      window.location.href = '/login';
    }
  }

  if (!response.ok) {
    let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.detail || errorMsg;
    } catch (_) {}
    throw new Error(errorMsg);
  }

  // Handle binary / CSV downloads
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/csv') || contentType.includes('application/octet-stream')) {
    return (await response.text()) as any;
  }

  return response.json();
}
