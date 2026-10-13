'use client';

import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Building,
  Briefcase,
  X,
  Upload,
  CheckCircle,
  AlertTriangle,
  Trash2,
  Edit,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, getStoredManager } from '@/lib/api';

export default function WorkersPage() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Current logged in manager
  const [currentManager, setCurrentManager] = useState<any>(null);

  // Modals
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<any | null>(null);
  const [workerDetail, setWorkerDetail] = useState<any | null>(null);
  const [workerToDelete, setWorkerToDelete] = useState<any | null>(null);

  // Register Form State (3 Required Fields: Worker Name, Worker ID, Allocated Manager)
  const [formData, setFormData] = useState({
    worker_id: '',
    worker_name: '',
    allocated_manager: 'Kumar',
  });
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Edit Form State
  const [editFormData, setEditFormData] = useState({
    worker_id: '',
    worker_name: '',
    allocated_manager: '',
  });
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

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
    setCurrentManager(getStoredManager());
    fetchWorkers();
  }, []);

  // Fetch next unique worker ID suggestion
  const handleAutoGenerateId = async () => {
    try {
      const res = await apiFetch('/workers/next-id');
      if (res.next_id) {
        setFormData((prev) => ({ ...prev, worker_id: res.next_id }));
      }
    } catch (e) {
      console.error('Failed to auto-generate worker ID:', e);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
      setRegisterError(null);
    }
  };

  const handleEditPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setEditPhoto(file);
      setEditPhotoPreview(URL.createObjectURL(file));
      setEditError(null);
    }
  };

  // Open Register Modal
  const openRegisterModal = async () => {
    setRegisterError(null);
    setRegisterSuccess(null);
    setSelectedPhoto(null);
    setPhotoPreview(null);
    setFormData({
      worker_id: '',
      worker_name: '',
      allocated_manager: currentManager?.username === 'prakash' ? 'Prakash' : 'Kumar',
    });
    setShowRegisterModal(true);
    await handleAutoGenerateId();
  };

  // Submit Worker Registration
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setRegisterSuccess(null);
    setRegisterError(null);

    try {
      const form = new FormData();
      form.append('worker_name', formData.worker_name.trim());
      form.append('allocated_manager', formData.allocated_manager.trim());
      if (formData.worker_id.trim()) {
        form.append('worker_id', formData.worker_id.trim());
      }
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
        setSelectedPhoto(null);
        setPhotoPreview(null);
      }, 1500);
    } catch (err: any) {
      setRegisterError(err.message || 'Worker registration failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (worker: any) => {
    setEditFormData({
      worker_id: worker.worker_id,
      worker_name: worker.worker_name,
      allocated_manager: worker.allocated_manager || 'Unassigned',
    });
    setEditPhoto(null);
    setEditPhotoPreview(worker.photo_path ? `/${worker.photo_path}` : null);
    setEditError(null);
    setShowEditModal(true);
  };

  // Submit Edit Worker
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError(null);

    try {
      const form = new FormData();
      form.append('worker_name', editFormData.worker_name.trim());
      form.append('allocated_manager', editFormData.allocated_manager.trim());
      if (editPhoto) {
        form.append('photo', editPhoto);
      }

      await apiFetch(`/workers/${editFormData.worker_id}`, {
        method: 'PUT',
        body: form,
      });

      fetchWorkers();
      setShowEditModal(false);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update worker.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Open Delete Confirmation Modal
  const confirmDeleteWorker = (worker: any) => {
    setWorkerToDelete(worker);
    setShowDeleteModal(true);
  };

  // Execute Delete
  const handleDeleteWorker = async () => {
    if (!workerToDelete) return;
    try {
      await apiFetch(`/workers/${workerToDelete.worker_id}`, {
        method: 'DELETE',
      });
      fetchWorkers();
      setShowDeleteModal(false);
      setWorkerToDelete(null);
    } catch (err: any) {
      alert(`Could not delete worker: ${err.message}`);
    }
  };

  // View Worker Details
  const handleViewDetails = async (workerId: string) => {
    try {
      const detail = await apiFetch(`/workers/${workerId}`);
      setWorkerDetail(detail);
      setSelectedWorker(detail.worker);
    } catch (err) {
      console.error(err);
    }
  };

  // Search filter
  const filteredWorkers = workers.filter(
    (w) =>
      w.worker_name.toLowerCase().includes(search.toLowerCase()) ||
      w.worker_id.toLowerCase().includes(search.toLowerCase()) ||
      (w.allocated_manager && w.allocated_manager.toLowerCase().includes(search.toLowerCase()))
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredWorkers.length / pageSize) || 1;
  const paginatedWorkers = filteredWorkers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const isAdmin = !currentManager || currentManager.role === 'ADMIN' || currentManager.role === 'SAFETY_MANAGER';

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-orange-400" />
            <h2 className="text-xl font-bold text-white tracking-wide font-mono">
              SENTINEL-X Worker Management
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Register industrial personnel with facial embeddings, single photo validation, and allocated manager records.
          </p>
        </div>

        {isAdmin ? (
          <button
            onClick={openRegisterModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-xs font-semibold text-white shadow-lg shadow-orange-600/25 transition-all cursor-pointer font-mono"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register Worker</span>
          </button>
        ) : (
          <div className="text-[11px] font-mono text-gray-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            Role: Project Manager (View Only)
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by worker name, worker ID, or manager..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 font-mono transition-colors"
          />
        </div>

        <div className="text-xs font-mono text-gray-400">
          Showing <span className="text-white font-bold">{filteredWorkers.length}</span> registered personnel
        </div>
      </div>

      {/* Clean Workers Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-gray-400 text-[11px] uppercase border-b border-slate-800">
              <tr>
                <th className="p-3.5">Worker Photo</th>
                <th className="p-3.5">Worker Name</th>
                <th className="p-3.5">Worker ID</th>
                <th className="p-3.5">Allocated Manager</th>
                <th className="p-3.5">Biometric Status</th>
                <th className="p-3.5">Registered Date</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 text-orange-400 mx-auto animate-spin mb-2" />
                    <span>Loading registered workers...</span>
                  </td>
                </tr>
              ) : paginatedWorkers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-400">
                    No registered workers matching search query. Click "Register Worker" to add personnel.
                  </td>
                </tr>
              ) : (
                paginatedWorkers.map((w) => (
                  <tr key={w.worker_id} className="hover:bg-slate-800/50 transition-colors">
                    {/* Photo */}
                    <td className="p-3.5">
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-950 border border-slate-700 flex items-center justify-center flex-shrink-0">
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
                          <Users className="w-5 h-5 text-gray-500" />
                        )}
                      </div>
                    </td>

                    {/* Worker Name */}
                    <td className="p-3.5 font-bold text-white text-sm">
                      {w.worker_name}
                    </td>

                    {/* Worker ID */}
                    <td className="p-3.5">
                      <span className="text-orange-400 bg-orange-950/70 border border-orange-800/80 px-2 py-0.5 rounded font-mono font-bold">
                        {w.worker_id}
                      </span>
                    </td>

                    {/* Allocated Manager */}
                    <td className="p-3.5">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Briefcase className="w-3.5 h-3.5 text-orange-400" />
                        <span className="font-semibold">{w.allocated_manager || 'Kumar'}</span>
                      </div>
                    </td>

                    {/* Biometric Status */}
                    <td className="p-3.5">
                      {w.embedding_path ? (
                        <span className="text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 w-max">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          EMBEDDING ACTIVE
                        </span>
                      ) : (
                        <span className="text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded text-[10px] font-bold w-max">
                          NO EMBEDDING
                        </span>
                      )}
                    </td>

                    {/* Registered Date */}
                    <td className="p-3.5 text-gray-400 text-[11px]">
                      {w.registered_at ? w.registered_at.split('T')[0] : '2026-10-12'}
                    </td>

                    {/* Action Buttons */}
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleViewDetails(w.worker_id)}
                          className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition-colors cursor-pointer"
                          title="View Attendance & Safety History"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {isAdmin && (
                          <>
                            <button
                              onClick={() => openEditModal(w)}
                              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white transition-colors cursor-pointer"
                              title="Edit Worker"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => confirmDeleteWorker(w)}
                              className="p-1.5 rounded bg-red-950/60 hover:bg-red-900/80 text-red-400 hover:text-red-200 border border-red-800/60 transition-colors cursor-pointer"
                              title="Remove Worker"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-3.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
            <span className="text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded bg-slate-800 text-white disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded bg-slate-800 text-white disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= REGISTER WORKER MODAL ================= */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2 font-mono">
                <UserPlus className="w-5 h-5 text-orange-400" />
                Register New Worker
              </h3>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {registerSuccess && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-700 text-emerald-300 rounded-lg text-xs flex items-center gap-2 font-mono">
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>{registerSuccess}</span>
              </div>
            )}

            {registerError && (
              <div className="p-3 bg-red-950/80 border border-red-700 text-red-300 rounded-lg text-xs flex items-center gap-2 font-mono">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{registerError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              {/* Field 1: Worker Name (Required) */}
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Worker Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sree Harsana"
                  value={formData.worker_name}
                  onChange={(e) => setFormData({ ...formData, worker_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              {/* Field 2: Worker ID (Required - manual entry or auto-generate) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-mono uppercase text-gray-300">
                    Worker ID *
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoGenerateId}
                    className="text-[11px] font-mono text-orange-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Auto-Generate ID</span>
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. W001"
                  value={formData.worker_id}
                  onChange={(e) => setFormData({ ...formData, worker_id: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              {/* Field 3: Allocated Manager (Required) */}
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Allocated Manager *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kumar or Prakash"
                  value={formData.allocated_manager}
                  onChange={(e) => setFormData({ ...formData, allocated_manager: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              {/* Upload Photo: Exactly 1 photo per worker */}
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Worker Registration Photo (One Clear Image)
                </label>
                <div className="border-2 border-dashed border-slate-800 rounded-xl p-4 text-center hover:border-orange-500 transition-colors bg-slate-950">
                  {photoPreview ? (
                    <div className="flex items-center justify-center gap-4">
                      <img
                        src={photoPreview}
                        alt="Worker Preview"
                        className="w-16 h-16 rounded-lg object-cover border border-slate-700"
                      />
                      <div className="text-left">
                        <span className="text-xs text-emerald-400 block font-mono">Photo ready for quality validation</span>
                        <label className="cursor-pointer text-xs text-orange-400 hover:underline font-mono">
                          Change Photo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoSelect}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="cursor-pointer flex flex-col items-center">
                      <Upload className="w-6 h-6 text-gray-400 mb-1.5" />
                      <span className="text-xs text-gray-300 font-mono">Click to upload 1 clear portrait photo (.jpg, .png)</span>
                      <span className="text-[10px] text-gray-500 font-mono mt-0.5">
                        Automated check for sharpness, illumination, and 256-D facial embedding
                      </span>
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

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-gray-300 font-mono cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-xs font-semibold text-white shadow-md shadow-orange-600/30 cursor-pointer disabled:opacity-50 font-mono"
                >
                  {submitting ? 'Validating & Enrolling...' : 'Enroll Worker'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= EDIT WORKER MODAL ================= */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2 font-mono">
                <Edit className="w-5 h-5 text-orange-400" />
                Edit Worker: {editFormData.worker_id}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-red-950/80 border border-red-700 text-red-300 rounded-lg text-xs flex items-center gap-2 font-mono">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Worker Name *
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.worker_name}
                  onChange={(e) => setEditFormData({ ...editFormData, worker_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Allocated Manager *
                </label>
                <input
                  type="text"
                  required
                  value={editFormData.allocated_manager}
                  onChange={(e) => setEditFormData({ ...editFormData, allocated_manager: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Update Photo (Optional)
                </label>
                <div className="border border-slate-800 rounded-xl p-3 bg-slate-950 flex items-center gap-4">
                  {editPhotoPreview ? (
                    <img
                      src={editPhotoPreview}
                      alt="Preview"
                      className="w-14 h-14 rounded-lg object-cover border border-slate-700"
                    />
                  ) : (
                    <Users className="w-10 h-10 text-gray-500" />
                  )}
                  <label className="cursor-pointer text-xs text-orange-400 hover:underline font-mono">
                    Upload New Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleEditPhotoSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-gray-300 font-mono cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-xs font-semibold text-white shadow-md shadow-orange-600/30 cursor-pointer disabled:opacity-50 font-mono"
                >
                  {editSubmitting ? 'Updating...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= DELETE CONFIRMATION MODAL ================= */}
      {showDeleteModal && workerToDelete && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl p-6 border border-red-900/60 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-950 border border-red-800 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base font-mono">Confirm Removal</h3>
                <p className="text-xs text-gray-400 font-mono">This action will delete the worker profile and biometric records.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-gray-300 space-y-1">
              <div>Worker Name: <span className="text-white font-bold">{workerToDelete.worker_name}</span></div>
              <div>Worker ID: <span className="text-orange-400 font-bold">{workerToDelete.worker_id}</span></div>
              <div>Allocated Manager: <span className="text-white font-bold">{workerToDelete.allocated_manager}</span></div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-gray-300 font-mono cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteWorker}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white cursor-pointer font-mono"
              >
                Delete Worker
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= WORKER DETAIL & HISTORY MODAL ================= */}
      {selectedWorker && workerDetail && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 rounded-2xl p-6 border border-slate-800 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-950 border border-slate-700">
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
                  <h3 className="font-bold text-white text-base font-mono">{selectedWorker.worker_name}</h3>
                  <div className="text-xs font-mono text-gray-400">
                    Worker ID: <span className="text-orange-400 font-bold">{selectedWorker.worker_id}</span> | Manager: <span className="text-white font-bold">{selectedWorker.allocated_manager || 'Kumar'}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedWorker(null);
                  setWorkerDetail(null);
                }}
                className="text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Attendance History */}
            <div className="space-y-2">
              <h4 className="text-xs font-mono uppercase text-gray-300 tracking-wider">
                Shift Attendance History (Logged Once Per Session)
              </h4>
              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900 text-gray-400 text-[10px]">
                    <tr>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5">First Seen (Check-in)</th>
                      <th className="p-2.5">Last Seen</th>
                      <th className="p-2.5">Confidence</th>
                      <th className="p-2.5">Attendance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {workerDetail.attendance_history.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-gray-400">
                          No attendance records found.
                        </td>
                      </tr>
                    ) : (
                      workerDetail.attendance_history.map((a: any) => (
                        <tr key={a.id}>
                          <td className="p-2.5 text-white">{a.date}</td>
                          <td className="p-2.5 text-gray-300">{a.first_seen_time}</td>
                          <td className="p-2.5 text-gray-300">{a.last_seen_time}</td>
                          <td className="p-2.5 text-orange-400 font-bold">{(a.confidence * 100).toFixed(1)}%</td>
                          <td className="p-2.5 text-emerald-400 font-bold">{a.attendance_status}</td>
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
              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900 text-gray-400 text-[10px]">
                    <tr>
                      <th className="p-2.5">Incident ID</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">Severity</th>
                      <th className="p-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {workerDetail.incident_history.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-emerald-400">
                          Clean safety record — No violations recorded.
                        </td>
                      </tr>
                    ) : (
                      workerDetail.incident_history.map((i: any) => (
                        <tr key={i.id}>
                          <td className="p-2.5 text-white">{i.incident_id}</td>
                          <td className="p-2.5 text-gray-300">{i.incident_type}</td>
                          <td className="p-2.5 text-amber-400">{i.severity}</td>
                          <td className="p-2.5 text-orange-400 font-bold">{i.status}</td>
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
