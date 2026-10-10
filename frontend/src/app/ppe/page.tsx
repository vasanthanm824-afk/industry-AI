'use client';

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  HardHat,
  Sparkles,
  RefreshCw,
  Download,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function PPEPage() {
  const [summary, setSummary] = useState<any>({
    total_inspections: 0,
    compliance_rate: 0,
    helmet_compliance_rate: 0,
    vest_compliance_rate: 0,
    gloves_compliance_rate: 0,
  });
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [sumRes, recRes] = await Promise.all([
        apiFetch('/ppe/summary'),
        apiFetch('/ppe/records?limit=60'),
      ]);
      setSummary(sumRes);
      setRecords(recRes.records || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-safety-cyan" />
            <h2 className="text-xl font-bold text-white tracking-wide">PPE Verification & Compliance</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Real-time automated inspection for Hardhat, High-Visibility Vest, and Protective Gloves.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-xs text-gray-300 border border-industrial-700"
          >
            <RefreshCw className="w-3.5 h-3.5 text-safety-cyan" />
            <span>Refresh</span>
          </button>
          <a
            href="/api/reports/ppe?format=csv"
            download="ppe_compliance_report.csv"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white shadow-md shadow-blue-600/30"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </a>
        </div>
      </div>

      {/* Compliance Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Compliance */}
        <div className="glass-card p-5 rounded-xl border border-industrial-700/60">
          <span className="text-xs font-mono text-gray-400 uppercase">Overall Compliance</span>
          <div className="text-3xl font-bold font-mono text-white mt-1">
            {summary.compliance_rate}%
          </div>
          <div className="w-full bg-industrial-950 h-2 rounded-full overflow-hidden mt-3 border border-industrial-800">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${summary.compliance_rate}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 block mt-2">
            Based on {summary.total_inspections} live CV audits
          </span>
        </div>

        {/* Helmet / Hardhat */}
        <div className="glass-card p-5 rounded-xl border border-industrial-700/60">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-xs font-mono uppercase">Safety Helmet</span>
            <HardHat className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white mt-1">
            {summary.helmet_compliance_rate}%
          </div>
          <div className="w-full bg-industrial-950 h-2 rounded-full overflow-hidden mt-3 border border-industrial-800">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${summary.helmet_compliance_rate}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 block mt-2">Head anatomical crop inspection</span>
        </div>

        {/* Safety Vest */}
        <div className="glass-card p-5 rounded-xl border border-industrial-700/60">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-xs font-mono uppercase">High-Vis Vest</span>
            <Sparkles className="w-4 h-4 text-safety-cyan" />
          </div>
          <div className="text-3xl font-bold font-mono text-white mt-1">
            {summary.vest_compliance_rate}%
          </div>
          <div className="w-full bg-industrial-950 h-2 rounded-full overflow-hidden mt-3 border border-industrial-800">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${summary.vest_compliance_rate}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 block mt-2">Torso fluorescence & saturation</span>
        </div>

        {/* Gloves */}
        <div className="glass-card p-5 rounded-xl border border-industrial-700/60">
          <div className="flex items-center justify-between text-gray-400 mb-1">
            <span className="text-xs font-mono uppercase">Work Gloves</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white mt-1">
            {summary.gloves_compliance_rate}%
          </div>
          <div className="w-full bg-industrial-950 h-2 rounded-full overflow-hidden mt-3 border border-industrial-800">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${summary.gloves_compliance_rate}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 block mt-2">Wrist/hand textile vs bare skin</span>
        </div>
      </div>

      {/* PPE Audit Inspection Log */}
      <div className="glass-panel p-5 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white text-sm tracking-wide">
            Live PPE Verification Event Log
          </h3>
          <span className="text-xs font-mono text-gray-400">
            Showing latest {records.length} checks
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-industrial-950/80 text-gray-400 uppercase text-[10px] border-b border-industrial-800">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Track ID</th>
                <th className="py-2.5 px-3">Worker Name</th>
                <th className="py-2.5 px-3">Helmet</th>
                <th className="py-2.5 px-3">Safety Vest</th>
                <th className="py-2.5 px-3">Gloves</th>
                <th className="py-2.5 px-3">Confidence</th>
                <th className="py-2.5 px-3">Overall Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-800/60">
              {records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    No PPE records logged yet.
                  </td>
                </tr>
              ) : (
                records.map((r: any) => (
                  <tr key={r.id} className="hover:bg-industrial-800/40">
                    <td className="py-2.5 px-3 text-gray-400">
                      {new Date(r.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 text-white font-bold">#{r.track_id}</td>
                    <td className="py-2.5 px-3 text-gray-300 font-sans">
                      {r.worker_name} {r.worker_id && `(${r.worker_id})`}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          r.helmet_status === 'COMPLIANT'
                            ? 'text-emerald-400 bg-emerald-950/70'
                            : r.helmet_status === 'VIOLATION'
                            ? 'text-red-400 bg-red-950/70'
                            : 'text-gray-400 bg-industrial-900'
                        }`}
                      >
                        {r.helmet_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          r.vest_status === 'COMPLIANT'
                            ? 'text-emerald-400 bg-emerald-950/70'
                            : r.vest_status === 'VIOLATION'
                            ? 'text-red-400 bg-red-950/70'
                            : 'text-gray-400 bg-industrial-900'
                        }`}
                      >
                        {r.vest_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          r.gloves_status === 'COMPLIANT'
                            ? 'text-emerald-400 bg-emerald-950/70'
                            : r.gloves_status === 'VIOLATION'
                            ? 'text-red-400 bg-red-950/70'
                            : 'text-gray-400 bg-industrial-900'
                        }`}
                      >
                        {r.gloves_status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-cyan-400">{(r.confidence * 100).toFixed(0)}%</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.overall_ppe_status === 'COMPLIANT'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : r.overall_ppe_status === 'VIOLATION'
                            ? 'bg-red-950 text-red-400 border border-red-800'
                            : 'bg-slate-900 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {r.overall_ppe_status}
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
