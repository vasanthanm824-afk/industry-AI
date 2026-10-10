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
  MapPin,
  AlertTriangle,
  Bell,
  CloudSun,
  FileSpreadsheet,
  LogOut,
  Shield,
} from 'lucide-react';
import { removeToken } from '@/lib/api';

const navItems = [
  { name: 'Operations Center', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Live CCTV Room', href: '/cctv', icon: Video },
  { name: 'Worker Registry', href: '/workers', icon: Users },
  { name: 'Shift Attendance', href: '/attendance', icon: CalendarCheck },
  { name: 'PPE Compliance', href: '/ppe', icon: ShieldCheck },
  { name: 'Zone Geofencing', href: '/zones', icon: MapPin },
  { name: 'Safety Incidents', href: '/incidents', icon: AlertTriangle },
  { name: 'Manager Alerts', href: '/alerts', icon: Bell },
  { name: 'Weather Station', href: '/weather', icon: CloudSun },
  { name: 'Compliance Reports', href: '/reports', icon: FileSpreadsheet },
];

export default function Sidebar() {
  const pathname = usePathname();

  const handleLogout = () => {
    removeToken();
    window.location.href = '/login';
  };

  if (pathname === '/login') {
    return null;
  }

  return (
    <aside className="w-64 bg-industrial-900 border-r border-industrial-700/50 flex flex-col h-screen fixed left-0 top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-5 border-b border-industrial-700/50 gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-safety-blue to-safety-cyan flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
          <Shield className="w-5 h-5" />
        </div>
        <div>
          <span className="font-bold text-white text-base tracking-wide flex items-center gap-1.5">
            AEGIS <span className="text-safety-cyan text-xs font-semibold px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-800">AI</span>
          </span>
          <span className="text-[10px] text-gray-400 block -mt-0.5 tracking-wider font-mono">INDUSTRIAL SAFETY</span>
        </div>
      </div>

      {/* Nav List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-gray-400">
          Monitoring & Operations
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-industrial-700 text-white shadow-sm border border-industrial-600/60'
                  : 'text-gray-300 hover:text-white hover:bg-industrial-800/80'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-safety-cyan' : 'text-gray-400'}`} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>

      {/* Footer / System Status */}
      <div className="p-4 border-t border-industrial-700/50 bg-industrial-950/40">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-mono text-gray-300">CV Spine Active</span>
          </div>
          <span className="text-[10px] font-mono text-gray-400">v2.0</span>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium text-gray-300 hover:text-red-300 hover:bg-red-950/30 border border-industrial-700/60 hover:border-red-900/50 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
