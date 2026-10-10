'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ShieldAlert, User, Clock } from 'lucide-react';
import { apiFetch, getStoredManager } from '@/lib/api';

export default function Header() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [manager, setManager] = useState<any>(null);

  useEffect(() => {
    setManager(getStoredManager());

    // Update real-time clock
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toTimeString().split(' ')[0] + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);

    // Fetch unread alerts
    const fetchUnread = async () => {
      try {
        const res = await apiFetch('/alerts/unread-count');
        setUnreadCount(res.unread_count || 0);
      } catch (_) {}
    };
    fetchUnread();
    const alertInterval = setInterval(fetchUnread, 15000);

    return () => {
      clearInterval(timer);
      clearInterval(alertInterval);
    };
  }, []);

  if (pathname === '/login') {
    return null;
  }

  const getPageTitle = () => {
    switch (pathname) {
      case '/dashboard': return 'Operations Center';
      case '/cctv': return 'Live CCTV Camera Feed & Telemetry';
      case '/workers': return 'Worker Directory & Enrollment';
      case '/attendance': return 'Shift Attendance Records';
      case '/ppe': return 'PPE Compliance Verification';
      case '/zones': return 'Industrial Geofencing & Zones';
      case '/incidents': return 'Safety Violations & Incident Action';
      case '/alerts': return 'Manager Alert Center';
      case '/weather': return 'Meteorological Risk Monitoring';
      case '/reports': return 'Official Compliance & Auditing Reports';
      default: return 'Safety Vision Platform';
    }
  };

  return (
    <header className="h-16 bg-industrial-900/90 backdrop-blur-md border-b border-industrial-700/50 flex items-center justify-between px-6 fixed top-0 right-0 left-64 z-20">
      {/* Title & Status */}
      <div className="flex items-center gap-4">
        <h1 className="text-base font-semibold text-white tracking-wide">{getPageTitle()}</h1>
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-[11px] font-mono text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          REAL-TIME TELEMETRY ENGINE
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-4">
        {/* Clock */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-gray-400 bg-industrial-950/60 px-3 py-1.5 rounded-md border border-industrial-800">
          <Clock className="w-3.5 h-3.5 text-safety-cyan" />
          <span>{currentTime || 'SYNCHRONIZING...'}</span>
        </div>

        {/* Alert Bell */}
        <Link
          href="/alerts"
          className="relative p-2 rounded-lg text-gray-300 hover:text-white hover:bg-industrial-800 transition-colors"
          title="Manager Alerts"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>

        {/* Manager User Chip */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-industrial-700/60">
          <div className="w-8 h-8 rounded-full bg-industrial-700 flex items-center justify-center text-white border border-industrial-600">
            <User className="w-4 h-4 text-safety-cyan" />
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-medium text-white">{manager?.full_name || 'Safety Manager'}</div>
            <div className="text-[10px] font-mono text-gray-400">{manager?.role || 'SAFETY_MANAGER'}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
