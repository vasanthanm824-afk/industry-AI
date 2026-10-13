'use client';

import React, { useEffect, useState } from 'react';
import {
  CalendarCheck,
  Calendar,
  Download,
  Users,
  Search,
  Briefcase,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function AttendancePage() {
  const [date, setDate] = useState<string>('');
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
      (r.allocated_manager && r.allocated_manager.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Date Filter */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <CalendarCheck className="w-6 h-6 text-orange-400" />
            <h2 className="text-xl font-bold text-white tracking-wide font-mono">
              SENTINEL-X Shift Attendance
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Automated biometric entry verification via webcam. Attendance marked exactly once per worker per date.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <Calendar className="w-4 h-4 text-orange-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="bg-transparent text-xs text-white focus:outline-none font-mono"
            />
          </div>

          <a
            href={`/api/reports/attendance?date=${date}&format=csv`}
            download={`sentinel_x_attendance_${date}.csv`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-gray-300 border border-slate-700 transition-colors font-mono cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-orange-400" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <span className="text-xs font-mono text-gray-400 uppercase">Workers Present Today</span>
          <div className="text-2xl font-bold text-white font-mono mt-1">{data.total_present}</div>
          <span className="text-[11px] text-emerald-400 font-mono">Shift attendance logged</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <span className="text-xs font-mono text-gray-400 uppercase">Total Registered Workers</span>
          <div className="text-2xl font-bold text-white font-mono mt-1">{data.total_registered}</div>
          <span className="text-[11px] text-gray-400 font-mono">Enrolled biometric database</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <span className="text-xs font-mono text-gray-400 uppercase">Attendance Rate</span>
          <div className="text-2xl font-bold text-orange-400 font-mono mt-1">
            {data.attendance_rate}%
          </div>
          <span className="text-[11px] text-gray-400 font-mono">Daily workforce turnout</span>
        </div>
      </div>

      {/* Search Filter */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Search by worker name, ID, or manager..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono"
        />
      </div>

      {/* Roster Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-gray-400 uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-3.5">Worker ID</th>
                <th className="py-3 px-3.5">Worker Name</th>
                <th className="py-3 px-3.5">Allocated Manager</th>
                <th className="py-3 px-3.5">First Seen (Check-in)</th>
                <th className="py-3 px-3.5">Last Seen</th>
                <th className="py-3 px-3.5">Confidence</th>
                <th className="py-3 px-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-400">
                    No attendance records logged for date {date}. Confidently recognized workers will be recorded automatically once.
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r: any) => (
                  <tr key={r.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-3 px-3.5 text-orange-400 font-bold">{r.worker_id}</td>
                    <td className="py-3 px-3.5 text-white font-semibold">{r.worker_name}</td>
                    <td className="py-3 px-3.5">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Briefcase className="w-3.5 h-3.5 text-orange-400" />
                        <span>{r.allocated_manager || 'Unassigned'}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3.5 text-gray-300">{r.first_seen_time}</td>
                    <td className="py-3 px-3.5 text-gray-300">{r.last_seen_time}</td>
                    <td className="py-3 px-3.5 text-orange-400 font-bold">
                      {(r.confidence * 100).toFixed(1)}%
                    </td>
                    <td className="py-3 px-3.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-800/80">
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
