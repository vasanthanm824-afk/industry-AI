'use client';

import React, { useEffect, useState } from 'react';
import {
  CalendarCheck,
  Calendar,
  Download,
  Users,
  CheckCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function AttendancePage() {
  const [date, setDate] = useState<string>('2026-10-07');
  const [data, setData] = useState<any>({
    records: [],
    total_present: 0,
    total_registered: 0,
    attendance_rate: 0,
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchAttendance = async (queryDate: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/attendance?date=${queryDate}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Default to today
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
    fetchAttendance(today);
  }, []);

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    fetchAttendance(newDate);
  };

  const filteredRecords = (data.records || []).filter(
    (r: any) =>
      r.worker_name.toLowerCase().includes(search.toLowerCase()) ||
      r.worker_id.toLowerCase().includes(search.toLowerCase()) ||
      (r.department && r.department.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Date Filter */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">Shift Attendance Roster</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Automated biometric entry verification via CCTV and temporal consensus tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-industrial-950 px-3 py-1.5 rounded-lg border border-industrial-700">
            <Calendar className="w-4 h-4 text-safety-cyan" />
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none font-mono"
            />
          </div>

          <a
            href={`/api/reports/attendance?date=${date}&format=csv`}
            download={`attendance_${date}.csv`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-xs text-gray-300 border border-industrial-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-safety-cyan" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-4 rounded-xl border border-industrial-700/60">
          <span className="text-xs font-mono text-gray-400 uppercase">Workers Present</span>
          <div className="text-2xl font-bold text-white font-mono mt-1">{data.total_present}</div>
          <span className="text-[11px] text-gray-400">Checked in on {date}</span>
        </div>

        <div className="glass-card p-4 rounded-xl border border-industrial-700/60">
          <span className="text-xs font-mono text-gray-400 uppercase">Total Enrolled</span>
          <div className="text-2xl font-bold text-white font-mono mt-1">{data.total_registered}</div>
          <span className="text-[11px] text-gray-400">Active biometric registry</span>
        </div>

        <div className="glass-card p-4 rounded-xl border border-industrial-700/60">
          <span className="text-xs font-mono text-gray-400 uppercase">Turnout Rate</span>
          <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
            {data.attendance_rate}%
          </div>
          <span className="text-[11px] text-gray-400">Shift workforce participation</span>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Search roster by worker or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-industrial-900 border border-industrial-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-safety-cyan"
        />
      </div>

      {/* Roster Table */}
      <div className="glass-panel p-5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-industrial-950/80 text-gray-400 uppercase text-[10px] border-b border-industrial-800">
              <tr>
                <th className="py-3 px-3">Worker ID</th>
                <th className="py-3 px-3">Worker Name</th>
                <th className="py-3 px-3">Department</th>
                <th className="py-3 px-3">First Seen (Entry)</th>
                <th className="py-3 px-3">Last Seen</th>
                <th className="py-3 px-3">Track ID</th>
                <th className="py-3 px-3">Confidence</th>
                <th className="py-3 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-800/60">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    No attendance records found for date {date}.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r: any) => (
                  <tr key={r.id} className="hover:bg-industrial-800/40">
                    <td className="py-3 px-3 text-cyan-400 font-bold">{r.worker_id}</td>
                    <td className="py-3 px-3 text-white font-sans font-medium">{r.worker_name}</td>
                    <td className="py-3 px-3 text-gray-300 font-sans">{r.department || 'Operations'}</td>
                    <td className="py-3 px-3 text-gray-300">{r.first_seen_time}</td>
                    <td className="py-3 px-3 text-gray-300">{r.last_seen_time}</td>
                    <td className="py-3 px-3 text-gray-400">#{r.track_id}</td>
                    <td className="py-3 px-3 text-emerald-400 font-bold">
                      {(r.confidence * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {r.attendance_status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
