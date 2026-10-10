'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle,
  Eye,
  FileCheck,
  X,
  Search,
  Filter,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  // Evidence modal state
  const [evidenceModalImage, setEvidenceModalImage] = useState<string | null>(null);

  // Action modal states
  const [actionIncident, setActionIncident] = useState<any | null>(null);
  const [actionType, setActionType] = useState<'acknowledge' | 'resolve' | null>(null);
  const [actionText, setActionText] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);

  const fetchIncidents = async () => {
    try {
      let query = '';
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (severityFilter) params.append('severity', severityFilter);
      if (params.toString()) query = `?${params.toString()}`;

      const res = await apiFetch(`/incidents${query}`);
      setIncidents(res.incidents || []);
      setSummary(res.summary || {});
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, [statusFilter, severityFilter]);

  const handleAcknowledge = async () => {
    if (!actionIncident) return;
    setSubmittingAction(true);
    try {
      await apiFetch(`/incidents/${actionIncident.incident_id}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ manager_note: actionText || 'Acknowledged by safety manager.' }),
      });
      setActionIncident(null);
      setActionType(null);
      setActionText('');
      fetchIncidents();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResolve = async () => {
    if (!actionIncident) return;
    if (!actionText.trim()) {
      alert('Please enter the corrective safety action taken.');
      return;
    }
    setSubmittingAction(true);
    try {
      await apiFetch(`/incidents/${actionIncident.incident_id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ action_taken: actionText }),
      });
      setActionIncident(null);
      setActionType(null);
      setActionText('');
      fetchIncidents();
    } catch (err: any) {
      alert(`Action failed: ${err.message}`);
    } finally {
      setSubmittingAction(false);
    }
  };

  const filteredIncidents = incidents.filter(
    (i) =>
      i.incident_id.toLowerCase().includes(search.toLowerCase()) ||
      i.worker_name.toLowerCase().includes(search.toLowerCase()) ||
      (i.worker_id && i.worker_id.toLowerCase().includes(search.toLowerCase())) ||
      i.zone.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">Workplace Safety Incident Log</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Automated visual evidence captures, severity ranking, and formal manager corrective action workflows.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-red-950/80 border border-red-800 text-red-300">
            Open: <strong>{summary.open_incidents || 0}</strong>
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-amber-950/80 border border-amber-800 text-amber-300">
            Critical: <strong>{summary.critical_count || 0}</strong>
          </span>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {['', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-industrial-700 text-white border border-industrial-600'
                  : 'bg-industrial-900 text-gray-400 border border-industrial-800 hover:text-white'
              }`}
            >
              {st || 'ALL STATUS'}
            </button>
          ))}
        </div>

        <div className="relative w-64">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search incidents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-industrial-900 border border-industrial-700 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-safety-cyan"
          />
        </div>
      </div>

      {/* Incidents Table */}
      <div className="glass-panel p-5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-industrial-950/80 text-gray-400 uppercase text-[10px] border-b border-industrial-800">
              <tr>
                <th className="py-3 px-3">Incident ID</th>
                <th className="py-3 px-3">Violation Type</th>
                <th className="py-3 px-3">Worker / Track</th>
                <th className="py-3 px-3">Zone Geofence</th>
                <th className="py-3 px-3">Severity</th>
                <th className="py-3 px-3">Evidence</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Manager Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-800/60">
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    No matching incidents found.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((inc) => (
                  <tr key={inc.incident_id} className="hover:bg-industrial-800/40">
                    <td className="py-3 px-3 text-white font-bold">{inc.incident_id}</td>
                    <td className="py-3 px-3 text-gray-300">{inc.incident_type}</td>
                    <td className="py-3 px-3 text-white font-sans font-medium">
                      {inc.worker_name} {inc.worker_id && `(${inc.worker_id})`}
                      {inc.track_id && <span className="block text-[10px] font-mono text-gray-400">Track #{inc.track_id}</span>}
                    </td>
                    <td className="py-3 px-3 text-gray-300 font-sans">{inc.zone}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inc.severity === 'CRITICAL'
                            ? 'bg-red-950 text-red-400 border border-red-800'
                            : inc.severity === 'HIGH'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-blue-950 text-blue-400 border border-blue-800'
                        }`}
                      >
                        {inc.severity}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {inc.evidence_image ? (
                        <button
                          onClick={() => setEvidenceModalImage(`/${inc.evidence_image}`)}
                          className="flex items-center gap-1 text-safety-cyan hover:underline cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Frame</span>
                        </button>
                      ) : (
                        <span className="text-gray-500">None</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          inc.status === 'RESOLVED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : inc.status === 'ACKNOWLEDGED'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-red-950 text-red-400 border border-red-800 animate-pulse'
                        }`}
                      >
                        {inc.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {inc.status === 'OPEN' ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setActionIncident(inc);
                              setActionType('acknowledge');
                            }}
                            className="px-2 py-1 rounded bg-industrial-800 hover:bg-industrial-700 text-amber-400 text-[10px] border border-industrial-700 cursor-pointer"
                          >
                            Acknowledge
                          </button>
                          <button
                            onClick={() => {
                              setActionIncident(inc);
                              setActionType('resolve');
                            }}
                            className="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-400 text-[10px] border border-emerald-800 cursor-pointer"
                          >
                            Resolve
                          </button>
                        </div>
                      ) : inc.status === 'ACKNOWLEDGED' ? (
                        <button
                          onClick={() => {
                            setActionIncident(inc);
                            setActionType('resolve');
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-400 text-[10px] border border-emerald-800 cursor-pointer"
                        >
                          Resolve Issue
                        </button>
                      ) : (
                        <span className="text-gray-400 text-[11px] font-sans truncate max-w-xs block" title={inc.manager_action}>
                          {inc.manager_action || 'Closed'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evidence Snapshot Modal */}
      {evidenceModalImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-3xl glass-panel rounded-2xl p-4 border border-industrial-700 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-industrial-800">
              <span className="text-xs font-mono text-red-400 font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                VERIFIED AUDIT EVIDENCE CAPTURE
              </span>
              <button
                onClick={() => setEvidenceModalImage(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative rounded-xl overflow-hidden bg-black max-h-[70vh] flex items-center justify-center border border-industrial-800">
              <img
                src={evidenceModalImage}
                alt="Incident Evidence"
                className="max-h-[70vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Manager Action Modal (Acknowledge / Resolve) */}
      {actionIncident && actionType && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 border border-industrial-700 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-industrial-800">
              <h3 className="font-bold text-white text-base">
                {actionType === 'acknowledge' ? 'Acknowledge Incident' : 'Resolve & Document Safety Action'}
              </h3>
              <button
                onClick={() => {
                  setActionIncident(null);
                  setActionType(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs font-mono text-gray-300 p-3 bg-industrial-950 rounded-lg border border-industrial-800 space-y-1">
              <div>ID: <strong className="text-white">{actionIncident.incident_id}</strong></div>
              <div>Type: <strong className="text-red-400">{actionIncident.incident_type}</strong></div>
              <div>Personnel: <strong className="text-cyan-400">{actionIncident.worker_name}</strong></div>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1.5">
                {actionType === 'acknowledge' ? 'Manager Inspection Note' : 'Corrective Action Taken *'}
              </label>
              <textarea
                rows={3}
                required
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                placeholder={
                  actionType === 'acknowledge'
                    ? 'Field safety team notified. Inspecting sector...'
                    : 'Worker escorted out of restricted zone. High-vis vest reissued. Logged in safety briefing.'
                }
                className="w-full p-2.5 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white focus:outline-none focus:border-safety-cyan"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActionIncident(null);
                  setActionType(null);
                }}
                className="px-4 py-2 rounded-lg bg-industrial-800 text-xs text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingAction}
                onClick={actionType === 'acknowledge' ? handleAcknowledge : handleResolve}
                className={`px-5 py-2 rounded-lg text-xs font-medium text-white shadow-md cursor-pointer ${
                  actionType === 'acknowledge'
                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                }`}
              >
                {submittingAction ? 'Documenting...' : actionType === 'acknowledge' ? 'Confirm Acknowledge' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
