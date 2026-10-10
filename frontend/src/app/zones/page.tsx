'use client';

import React, { useEffect, useState } from 'react';
import {
  MapPin,
  Shield,
  AlertTriangle,
  ShieldAlert,
  Plus,
  Trash2,
  Edit2,
  Users,
  CheckCircle,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function ZonesPage() {
  const [zones, setZones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detections, setDetections] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    zone_id: '',
    zone_name: '',
    zone_type: 'RESTRICTED',
    color_hex: '#ef4444',
    description: '',
    polygon_str: '[[0.7, 0.3], [1.0, 0.3], [1.0, 1.0], [0.7, 1.0]]',
  });

  const fetchZones = async () => {
    try {
      const [zRes, dRes] = await Promise.all([
        apiFetch('/zones'),
        apiFetch('/detections').catch(() => ({ detections: [] })),
      ]);
      setZones(zRes.zones || []);
      setDetections(dRes.detections || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZones();
    const interval = setInterval(fetchZones, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let parsedPoly;
      try {
        parsedPoly = JSON.parse(formData.polygon_str);
      } catch (_) {
        alert('Invalid JSON format for polygon coordinates. Use: [[0.1, 0.2], [0.3, 0.4], ...]');
        return;
      }

      await apiFetch('/zones', {
        method: 'POST',
        body: JSON.stringify({
          zone_id: formData.zone_id,
          zone_name: formData.zone_name,
          zone_type: formData.zone_type,
          color_hex: formData.color_hex,
          description: formData.description,
          polygon: parsedPoly,
        }),
      });

      setShowCreateModal(false);
      setFormData({
        zone_id: '',
        zone_name: '',
        zone_type: 'RESTRICTED',
        color_hex: '#ef4444',
        description: '',
        polygon_str: '[[0.7, 0.3], [1.0, 0.3], [1.0, 1.0], [0.7, 1.0]]',
      });
      fetchZones();
    } catch (err: any) {
      alert(`Failed to create zone: ${err.message}`);
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!confirm(`Are you sure you want to delete zone ${zoneId}?`)) return;
    try {
      await apiFetch(`/zones/${zoneId}`, { method: 'DELETE' });
      fetchZones();
    } catch (err: any) {
      alert(`Failed to delete zone: ${err.message}`);
    }
  };

  const getOccupancy = (zoneName: string) => {
    return detections.filter((d: any) => d.zone_name === zoneName).length;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="w-6 h-6 text-safety-cyan" />
            <h2 className="text-xl font-bold text-white tracking-wide">Industrial Spatial Geofencing</h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Configurable 2D spatial boundaries and automatic breach detection without modifying CV code.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Geofence</span>
        </button>
      </div>

      {/* Zone Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {zones.map((z) => {
          const occ = getOccupancy(z.zone_name);
          const isRestricted = z.zone_type === 'RESTRICTED';
          const isWarning = z.zone_type === 'WARNING';

          return (
            <div
              key={z.zone_id}
              className="glass-card p-5 rounded-2xl border border-industrial-700/60 flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: z.color_hex || '#3b82f6' }}
                    />
                    <h3 className="text-sm font-bold text-white">{z.zone_name}</h3>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                      isRestricted
                        ? 'bg-red-950/80 border-red-800 text-red-400'
                        : isWarning
                        ? 'bg-amber-950/80 border-amber-800 text-amber-400'
                        : 'bg-emerald-950/80 border-emerald-800 text-emerald-400'
                    }`}
                  >
                    {z.zone_type}
                  </span>
                </div>

                <div className="text-[11px] font-mono text-cyan-400 mt-1">{z.zone_id}</div>
                <p className="text-xs text-gray-400 mt-2 line-clamp-2">
                  {z.description || 'No specific description provided.'}
                </p>
              </div>

              {/* Polygon Vertices Preview */}
              <div className="p-2 rounded bg-industrial-950 border border-industrial-800 text-[10px] font-mono text-gray-400 truncate">
                Vertices: {JSON.stringify(z.polygon)}
              </div>

              <div className="pt-3 border-t border-industrial-800 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-300">Live Workers:</span>
                  <strong className={occ > 0 && isRestricted ? 'text-red-400' : 'text-white'}>
                    {occ}
                  </strong>
                </div>

                <button
                  onClick={() => handleDeleteZone(z.zone_id)}
                  className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                  title="Delete Zone"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Zone Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel rounded-2xl p-6 border border-industrial-700 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-industrial-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Plus className="w-5 h-5 text-safety-cyan" />
                Define Industrial Geofence
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateZone} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                    Zone ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ZONE-REST-02"
                    value={formData.zone_id}
                    onChange={(e) => setFormData({ ...formData, zone_id: e.target.value })}
                    className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                    Zone Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Crane Swing Perimeter"
                    value={formData.zone_name}
                    onChange={(e) => setFormData({ ...formData, zone_name: e.target.value })}
                    className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                    Zone Classification *
                  </label>
                  <select
                    value={formData.zone_type}
                    onChange={(e) => setFormData({ ...formData, zone_type: e.target.value })}
                    className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white"
                  >
                    <option value="RESTRICTED">RESTRICTED (Red / Breach Alert)</option>
                    <option value="WARNING">WARNING (Amber / Buffer)</option>
                    <option value="SAFE">SAFE (Green / Walkway)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                    Color Hex
                  </label>
                  <input
                    type="text"
                    value={formData.color_hex}
                    onChange={(e) => setFormData({ ...formData, color_hex: e.target.value })}
                    className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white font-mono"
                    placeholder="#ef4444"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white"
                  placeholder="Overhead crane operational radius; high-risk collision zone."
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                  Polygon Coordinates (JSON normalized 0.0 to 1.0 or pixel space)
                </label>
                <textarea
                  rows={3}
                  value={formData.polygon_str}
                  onChange={(e) => setFormData({ ...formData, polygon_str: e.target.value })}
                  className="w-full p-2.5 bg-industrial-950 border border-industrial-700 rounded-lg text-xs text-white font-mono"
                  placeholder="[[0.7, 0.3], [1.0, 0.3], [1.0, 1.0], [0.7, 1.0]]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-industrial-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-industrial-800 text-xs text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white shadow-md shadow-blue-600/30 cursor-pointer"
                >
                  Save Geofence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
