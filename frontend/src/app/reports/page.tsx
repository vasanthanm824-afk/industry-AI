'use client';

import React, { useEffect, useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  FileJson,
  CheckCircle,
  FileText,
  ShieldCheck,
  MapPin,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

const REPORT_TABS = [
  { id: 'daily-summary', name: 'Executive Safety Summary', icon: FileText },
  { id: 'attendance', name: 'Shift Attendance Report', icon: FileSpreadsheet },
  { id: 'ppe', name: 'PPE Compliance Audit', icon: ShieldCheck },
  { id: 'zones', name: 'Zone Geofence Violations', icon: MapPin },
  { id: 'incidents', name: 'Safety Incident Register', icon: AlertTriangle },
];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('daily-summary');
  const [date, setDate] = useState('2026-10-07');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchReport = async (tab: string, targetDate: string) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/reports/${tab}?date=${targetDate}&format=json`);
      setReportData(res);
    } catch (e) {
      console.error(e);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
    fetchReport(activeTab, today);
  }, []);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    fetchReport(tabId, date);
  };

  const handleDateChange = (newDate: string) => {
    setDate(newDate);
    fetchReport(activeTab, newDate);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Export Actions */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-safety-cyan" />
            <h2 className="text-xl font-bold text-white tracking-wide">Compliance & Auditing Reports</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Formal auditable records generated from live database logs. Date-filtered and downloadable in CSV and JSON formats.
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
            href={`/api/reports/${activeTab}?date=${date}&format=csv`}
            download={`${activeTab}_report_${date}.csv`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-medium text-white shadow-md shadow-emerald-700/20 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </a>

          <a
            href={`/api/reports/${activeTab}?date=${date}&format=json`}
            target="_blank"
            download={`${activeTab}_report_${date}.json`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-xs font-medium text-gray-300 border border-industrial-700 transition-colors"
          >
            <FileJson className="w-3.5 h-3.5 text-safety-cyan" />
            <span>JSON</span>
          </a>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-industrial-800 pb-3">
        {REPORT_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold'
                  : 'bg-industrial-900/80 text-gray-400 hover:text-white hover:bg-industrial-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>

      {/* Report Data Presentation */}
      <div className="glass-panel p-6 rounded-2xl">
        {loading ? (
          <div className="py-16 text-center text-gray-400 text-xs font-mono flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-safety-cyan" />
            <span>Compiling report data for {date}...</span>
          </div>
        ) : activeTab === 'daily-summary' && reportData ? (
          /* Executive Summary Card View */
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-industrial-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">Daily Operations Safety Summary</h3>
                <span className="text-xs font-mono text-cyan-400">Date: {reportData.date}</span>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                  reportData.facility_status === 'NORMAL_OPERATIONS'
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-red-950 text-red-400 border-red-800'
                }`}
              >
                STATUS: {reportData.facility_status}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-industrial-950 border border-industrial-800">
                <span className="text-[10px] font-mono uppercase text-gray-400 block">Workers Present</span>
                <span className="text-2xl font-bold font-mono text-white">
                  {reportData.workers_present_today} / {reportData.total_registered_workers}
                </span>
                <span className="text-[10px] text-gray-400 block mt-1">
                  Turnout: {reportData.attendance_rate_pct}%
                </span>
              </div>

              <div className="p-4 rounded-xl bg-industrial-950 border border-industrial-800">
                <span className="text-[10px] font-mono uppercase text-gray-400 block">PPE Compliance</span>
                <span className="text-2xl font-bold font-mono text-white">
                  {reportData.overall_ppe_compliance_pct}%
                </span>
                <span className="text-[10px] text-gray-400 block mt-1">
                  {reportData.ppe_inspections_total} automated checks
                </span>
              </div>

              <div className="p-4 rounded-xl bg-industrial-950 border border-industrial-800">
                <span className="text-[10px] font-mono uppercase text-gray-400 block">Total Safety Incidents</span>
                <span className="text-2xl font-bold font-mono text-amber-400">
                  {reportData.total_incidents}
                </span>
                <span className="text-[10px] text-gray-400 block mt-1">
                  {reportData.open_incidents} open / {reportData.critical_incidents} critical
                </span>
              </div>

              <div className="p-4 rounded-xl bg-industrial-950 border border-industrial-800">
                <span className="text-[10px] font-mono uppercase text-gray-400 block">Weather Risk</span>
                <span className="text-2xl font-bold font-mono text-white">
                  {reportData.weather_temperature_c !== null ? `${reportData.weather_temperature_c}°C` : '--'}
                </span>
                <span className="text-[10px] text-gray-400 block mt-1">
                  Risk Level: <strong className="text-emerald-400">{reportData.weather_risk_level}</strong>
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Table View for Row-based Reports */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-industrial-950/80 text-gray-400 uppercase text-[10px] border-b border-industrial-800">
                <tr>
                  {reportData?.data && reportData.data.length > 0 ? (
                    Object.keys(reportData.data[0]).map((col) => (
                      <th key={col} className="py-2.5 px-3">
                        {col.replace(/_/g, ' ')}
                      </th>
                    ))
                  ) : (
                    <th className="py-2.5 px-3">Status</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-industrial-800/60">
                {!reportData?.data || reportData.data.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-gray-400">
                      No records found for {activeTab} on {date}.
                    </td>
                  </tr>
                ) : (
                  reportData.data.map((row: any, idx: number) => (
                    <tr key={idx} className="hover:bg-industrial-800/40">
                      {Object.values(row).map((val: any, cidx: number) => (
                        <td key={cidx} className="py-2.5 px-3 text-gray-300">
                          {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
