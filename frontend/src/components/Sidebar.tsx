'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Video,
  Users,
  CalendarCheck,
  ShieldCheck,
  AlertTriangle,
  CloudSun,
  Settings,
  LogOut,
  Shield,
  Bell,
  MapPin,
  FileSpreadsheet,
} from 'lucide-react';
import { removeToken, getStoredManager } from '@/lib/api';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Workers', href: '/workers', icon: Users },
  { name: 'Attendance', href: '/attendance', icon: CalendarCheck },
  { name: 'PPE Monitoring', href: '/ppe', icon: ShieldCheck },
  { name: 'Live Camera Room', href: '/cctv', icon: Video },
  { name: 'Violations', href: '/incidents', icon: AlertTriangle },
  { name: 'Weather', href: '/weather', icon: CloudSun },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(false);
  const [manager, setManager] = React.useState<any>(null);

  React.useEffect(() => {
    setMounted(true);
    setManager(getStoredManager());
  }, []);

  const handleLogout = () => {
    removeToken();
    window.location.href = '/login';
  };

  if (pathname === '/login') {
    return null;
  }

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-30 select-none">
      {/* Product Header: SENTINEL-X */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800 gap-3 bg-slate-900/60">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-600/20">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="font-bold text-white text-base tracking-wide flex items-center gap-1.5 font-mono">
            SENTINEL<span className="text-orange-400 font-extrabold">-X</span>
          </span>
          <span className="text-[10px] text-gray-400 block -mt-0.5 tracking-wider font-mono">
            SMART SAFETY & ATTENDANCE
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-gray-400">
          Industrial Control
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-700/80 font-semibold'
                  : 'text-gray-300 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-orange-400' : 'text-gray-400'}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>

      {/* User Info & System Status */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/40">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-mono text-gray-300">Engine Online</span>
          </div>
          <span
            suppressHydrationWarning
            className="text-[10px] font-mono text-orange-400 bg-orange-950/70 border border-orange-800/80 px-1.5 py-0.5 rounded"
          >
            {mounted ? (manager?.role || 'ADMIN') : 'ADMIN'}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium text-gray-300 hover:text-red-300 hover:bg-red-950/30 border border-slate-800 hover:border-red-900/50 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
