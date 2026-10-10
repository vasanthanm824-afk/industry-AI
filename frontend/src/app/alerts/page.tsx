'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Clock,
  ArrowRight,
  CheckCheck,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      const res = await apiFetch('/alerts?limit=100');
      setAlerts(res.alerts || []);
      setUnreadCount(res.unread_count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkRead = async (alertId: string) => {
    try {
      await apiFetch(`/alerts/${alertId}/read`, { method: 'POST' });
      fetchAlerts();
    } catch (e) {
      console.error(e);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/alerts/read-all', { method: 'POST' });
      fetchAlerts();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-6 h-6 text-safety-cyan" />
            <h2 className="text-xl font-bold text-white tracking-wide">Manager Alert Dispatch Center</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Critical breach notifications dispatched directly from the real-time AI safety engine.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-xs font-medium text-gray-300 border border-industrial-700 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <CheckCheck className="w-4 h-4 text-emerald-400" />
            <span>Mark All as Read</span>
          </button>
        </div>
      </div>

      {/* Alerts Feed */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="glass-panel p-12 rounded-2xl text-center text-gray-400 text-xs font-mono">
            No manager alerts in queue. All facility sectors operational.
          </div>
        ) : (
          alerts.map((alt) => {
            const isCrit = alt.severity === 'CRITICAL';
            const isHigh = alt.severity === 'HIGH';

            return (
              <div
                key={alt.alert_id}
                className={`p-4 rounded-xl border transition-all ${
                  !alt.is_read
                    ? 'bg-industrial-900/90 border-industrial-600/80 shadow-md shadow-black/40'
                    : 'bg-industrial-950/60 border-industrial-800/60 opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        isCrit
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : isHigh
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-blue-950 text-blue-400 border border-blue-800'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.2 rounded border ${
                            isCrit
                              ? 'bg-red-950/80 border-red-700 text-red-400'
                              : isHigh
                              ? 'bg-amber-950/80 border-amber-700 text-amber-400'
                              : 'bg-blue-950/80 border-blue-700 text-blue-400'
                          }`}
                        >
                          {alt.severity}
                        </span>
                        <span className="text-[11px] font-mono text-cyan-400">{alt.alert_id}</span>
                        {!alt.is_read && (
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                        )}
                      </div>

                      <p className="text-sm font-medium text-white">{alt.message}</p>

                      <div className="flex items-center gap-4 text-[11px] font-mono text-gray-400 pt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {new Date(alt.timestamp).toLocaleString()}
                        </span>
                        {alt.incident_id && (
                          <Link
                            href={`/incidents?focus=${alt.incident_id}`}
                            className="text-safety-cyan hover:underline flex items-center gap-1"
                          >
                            Incident: {alt.incident_id} <ArrowRight className="w-3 h-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  {!alt.is_read && (
                    <button
                      onClick={() => handleMarkRead(alt.alert_id)}
                      className="px-2.5 py-1 rounded bg-industrial-800 hover:bg-industrial-700 text-[11px] font-mono text-gray-300 border border-industrial-700 cursor-pointer flex-shrink-0"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
