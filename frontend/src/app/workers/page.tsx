'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  Building,
  Briefcase,
  X,
  Upload,
  CheckCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function WorkersPage() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<any | null>(null);
  const [workerDetail, setWorkerDetail] = useState<any | null>(null);

  // New worker form state
  const [formData, setFormData] = useState({
    worker_id: '',
    worker_name: '',
    department: 'Operations',
    role: 'Technician',
  });
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

  const fetchWorkers = async () => {
    try {
      const res = await apiFetch('/workers');
      setWorkers(res.workers || []);
    } catch (e) {
      console.error('Failed to load workers:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setRegisterSuccess(null);

    try {
      const form = new FormData();
      form.append('worker_id', formData.worker_id);
      form.append('worker_name', formData.worker_name);
      form.append('department', formData.department);
      form.append('role', formData.role);
      if (selectedPhoto) {
        form.append('photo', selectedPhoto);
      }

      const res = await apiFetch('/workers', {
        method: 'POST',
        body: form,
      });

      setRegisterSuccess(res.message);
      fetchWorkers();
      setTimeout(() => {
        setShowRegisterModal(false);
        setRegisterSuccess(null);
        setFormData({ worker_id: '', worker_name: '', department: 'Operations', role: 'Technician' });
        setSelectedPhoto(null);
        setPhotoPreview(null);
      }, 1500);
    } catch (err: any) {
      alert(`Registration failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDetails = async (workerId: string) => {
    try {
      const detail = await apiFetch(`/workers/${workerId}`);
      setWorkerDetail(detail);
      setSelectedWorker(detail.worker);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredWorkers = workers.filter(
    (w) =>
      w.worker_name.toLowerCase().includes(search.toLowerCase()) ||
      w.worker_id.toLowerCase().includes(search.toLowerCase()) ||
      w.department.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">Worker Personnel Management</h2>
          <p className="text-xs text-gray-400 mt-1">
            Registered industrial operators, biometric appearance embeddings, and safety histories.
          </p>
        </div>

        <button
          onClick={() => setShowRegisterModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition-all cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Enroll New Worker</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
        <input
          type="text"
          placeholder="Filter by name, ID, or department..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-industrial-900 border border-industrial-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-safety-cyan"
        />
      </div>

      {/* Worker Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredWorkers.map((w) => (
          <div
            key={w.worker_id}
            className="glass-card p-5 rounded-2xl border border-industrial-700/60 flex flex-col justify-between space-y-4"
          >
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-industrial-950 border border-industrial-700 flex-shrink-0 flex items-center justify-center">
                {w.photo_path ? (
                  <img
                    src={`/${w.photo_path}`}
                    alt={w.worker_name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <Users className="w-6 h-6 text-gray-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white truncate">{w.worker_name}</h3>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/70 border border-cyan-800 px-1.5 py-0.5 rounded">
                    {w.worker_id}
                  </span>
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-1">
                  <Building className="w-3.5 h-3.5 text-gray-400" />
                  <span>{w.department}</span>
                </div>
                <div className="text-xs text-gray-400 flex items-center gap-1.5 mt-0.5">
                  <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                  <span>{w.role}</span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-industrial-800/80 flex items-center justify-between text-xs font-mono">
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                ACTIVE BIOMETRIC
              </span>
              <button
                onClick={() => handleViewDetails(w.worker_id)}
                className="text-safety-cyan hover:underline cursor-pointer"
              >
                View History &rarr;
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Register Worker Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel rounded-2xl p-6 border border-industrial-700 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-industrial-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-safety-cyan" />
                Enroll New Industrial Worker
              </h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {registerSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-700 text-emerald-300 rounded-lg text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{registerSuccess}</span>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                    Worker ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="EMP-03"
                    value={formData.worker_id}
                    onChange={(e) => setFormData({ ...formData, worker_id: e.target.value })}
                    className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Elena Rostova"
                    value={formData.worker_name}
                    onChange={(e) => setFormData({ ...formData, worker_name: e.target.value })}
                    className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                    Department
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white"
                  >
                    <option value="Operations">Operations</option>
                    <option value="Mechanical Operations">Mechanical Operations</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Safety & Quality">Safety & Quality</option>
                    <option value="Assembly">Assembly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                    Assigned Role
                  </label>
                  <input
                    type="text"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white"
                    placeholder="Safety Technician"
                  />
                </div>
              </div>

              {/* Photo Upload & Biometric Extraction */}
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Registration Photo (Generates 256-D Biometric Embedding)
                </label>
                <div className="border-2 border-dashed border-industrial-700 rounded-xl p-4 text-center hover:border-safety-cyan transition-colors">
                  {photoPreview ? (
                    <div className="flex items-center justify-center gap-4">
                      <img
                        src={photoPreview}
                        alt="Preview"
                        className="w-16 h-16 rounded-lg object-cover border border-industrial-600"
                      />
                      <label className="cursor-pointer text-xs text-safety-cyan hover:underline">
                        Change Photo
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoSelect}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center">
                      <Upload className="w-6 h-6 text-gray-400 mb-1" />
                      <span className="text-xs text-gray-300">Click to upload face crop (.jpg, .png)</span>
                      <span className="text-[10px] text-gray-400">YOLOv8 deep feature extractor will process biometric vector</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-industrial-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 rounded-lg bg-industrial-800 text-xs text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white shadow-md shadow-blue-600/30 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Extracting Embeddings...' : 'Enroll Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Worker Detail & History Modal */}
      {selectedWorker && workerDetail && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl glass-panel rounded-2xl p-6 border border-industrial-700 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-industrial-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-industrial-950 border border-industrial-700">
                  {selectedWorker.photo_path ? (
                    <img
                      src={`/${selectedWorker.photo_path}`}
                      alt={selectedWorker.worker_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Users className="w-6 h-6 text-gray-400 m-3" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{selectedWorker.worker_name}</h3>
                  <div className="text-xs font-mono text-gray-400">
                    ID: {selectedWorker.worker_id} | {selectedWorker.department} ({selectedWorker.role})
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedWorker(null);
                  setWorkerDetail(null);
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Attendance History */}
            <div className="space-y-2">
              <h4 className="text-xs font-mono uppercase text-gray-300 tracking-wider">
                Shift Attendance History
              </h4>
              <div className="rounded-xl border border-industrial-800 overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-industrial-950 text-gray-400 text-[10px]">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">First Seen</th>
                      <th className="p-2">Last Seen</th>
                      <th className="p-2">Confidence</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-industrial-900">
                    {workerDetail.attendance_history.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-gray-400">
                          No attendance records found.
                        </td>
                      </tr>
                    ) : (
                      workerDetail.attendance_history.map((a: any) => (
                        <tr key={a.id}>
                          <td className="p-2 text-white">{a.date}</td>
                          <td className="p-2 text-gray-300">{a.first_seen_time}</td>
                          <td className="p-2 text-gray-300">{a.last_seen_time}</td>
                          <td className="p-2 text-safety-cyan">{(a.confidence * 100).toFixed(1)}%</td>
                          <td className="p-2 text-emerald-400 font-bold">{a.attendance_status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Safety Violations History */}
            <div className="space-y-2">
              <h4 className="text-xs font-mono uppercase text-gray-300 tracking-wider">
                Safety Incident Log
              </h4>
              <div className="rounded-xl border border-industrial-800 overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-industrial-950 text-gray-400 text-[10px]">
                    <tr>
                      <th className="p-2">Incident ID</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Severity</th>
                      <th className="p-2">Zone</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-industrial-900">
                    {workerDetail.incident_history.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-3 text-center text-gray-400">
                          Clean safety record — No violations recorded.
                        </td>
                      </tr>
                    ) : (
                      workerDetail.incident_history.map((i: any) => (
                        <tr key={i.id}>
                          <td className="p-2 text-white">{i.incident_id}</td>
                          <td className="p-2 text-gray-300">{i.incident_type}</td>
                          <td className="p-2 text-amber-400">{i.severity}</td>
                          <td className="p-2 text-gray-400">{i.zone}</td>
                          <td className="p-2 text-cyan-400">{i.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
