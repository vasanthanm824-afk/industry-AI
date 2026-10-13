'use client';

import React, { useEffect, useState } from 'react';
import {
  Settings,
  MapPin,
  Thermometer,
  ShieldCheck,
  User,
  Save,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Sliders,
  Compass,
} from 'lucide-react';
import { apiFetch, getStoredManager } from '@/lib/api';

export default function SettingsPage() {
  const [manager, setManager] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Worksite Location Settings
  const [locationName, setLocationName] = useState('Industrial Facility Alpha');
  const [latitude, setLatitude] = useState('37.7749');
  const [longitude, setLongitude] = useState('-122.4194');
  const [locError, setLocError] = useState<string | null>(null);

  // Environmental Sensor Mode
  const [sensorMode, setSensorMode] = useState<'WEATHER_API' | 'PHYSICAL_SENSOR'>('WEATHER_API');
  const [physicalTemp, setPhysicalTemp] = useState('23.4');
  const [calibrationOffset, setCalibrationOffset] = useState('0.0');

  // Biometric & Inference Calibration
  const [confidenceThreshold, setConfidenceThreshold] = useState('0.98');
  const [consensusFrames, setConsensusFrames] = useState('5');

  useEffect(() => {
    setManager(getStoredManager());
    // Fetch physical sensor state
    apiFetch('/weather/sensor')
      .then((res) => {
        if (res.temperature_c) setPhysicalTemp(String(res.temperature_c));
        if (res.calibration_offset !== undefined) setCalibrationOffset(String(res.calibration_offset));
      })
      .catch(() => {});
  }, []);

  // Request browser location
  const handleUseBrowserLocation = () => {
    setLocError(null);
    if (!navigator.geolocation) {
      setLocError('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(4);
        const lon = pos.coords.longitude.toFixed(4);
        setLatitude(lat);
        setLongitude(lon);
        setLocationName(`Current Browser Worksite (${lat}, ${lon})`);
        setSaveSuccess('Worksite GPS coordinates acquired from browser.');
        setTimeout(() => setSaveSuccess(null), 3000);
      },
      (err) => {
        setLocError(`Location permission denied or unavailable: ${err.message}. Please configure manually.`);
      }
    );
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(null);

    try {
      // 1. Refresh weather for configured coordinates
      await apiFetch('/weather/refresh', {
        method: 'POST',
        body: JSON.stringify({
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          location_name: locationName,
        }),
      });

      // 2. Update physical sensor telemetry
      await apiFetch('/weather/sensor', {
        method: 'POST',
        body: JSON.stringify({
          temperature_c: parseFloat(physicalTemp),
          calibration_offset: parseFloat(calibrationOffset),
        }),
      });

      setSaveSuccess('SENTINEL-X system settings updated and synchronized.');
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err: any) {
      alert(`Failed to save settings: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-orange-400" />
            <h2 className="text-xl font-bold text-white tracking-wide font-mono">
              SENTINEL-X Configuration & Calibration
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Worksite environmental geofencing, physical sensor calibration, role permissions, and storage retention.
          </p>
        </div>

        {saveSuccess && (
          <div className="p-2.5 bg-emerald-950/80 border border-emerald-700 text-emerald-300 rounded-lg text-xs font-mono flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>{saveSuccess}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* Section 1: Worksite Location & Weather Source */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-400" />
              <h3 className="font-bold text-white text-sm font-mono uppercase tracking-wider">
                1. Worksite Location & Weather System
              </h3>
            </div>
            <button
              type="button"
              onClick={handleUseBrowserLocation}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-orange-400 border border-slate-700 cursor-pointer transition-colors"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Use Current Browser Location</span>
            </button>
          </div>

          {locError && (
            <div className="p-3 bg-amber-950/70 border border-amber-800 text-amber-300 rounded-lg text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{locError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                Worksite Name / Label
              </label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                Latitude (°N)
              </label>
              <input
                type="text"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                Longitude (°E)
              </label>
              <input
                type="text"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Section 2: Physical Sensor vs Atmospheric Weather Service */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Thermometer className="w-4 h-4 text-orange-400" />
            <h3 className="font-bold text-white text-sm font-mono uppercase tracking-wider">
              2. Temperature Monitoring Source & Physical Sensor Integration
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => setSensorMode('WEATHER_API')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                sensorMode === 'WEATHER_API'
                  ? 'bg-slate-950 border-orange-500 shadow-md shadow-orange-500/10'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs font-mono">Open-Meteo Atmospheric Weather API</span>
                {sensorMode === 'WEATHER_API' && <CheckCircle className="w-4 h-4 text-orange-400" />}
              </div>
              <p className="text-[11px] text-gray-400 font-mono mt-1">
                Fetches ambient atmospheric weather data (temperature, wind, humidity) for external perimeter safety.
              </p>
            </div>

            <div
              onClick={() => setSensorMode('PHYSICAL_SENSOR')}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                sensorMode === 'PHYSICAL_SENSOR'
                  ? 'bg-slate-950 border-orange-500 shadow-md shadow-orange-500/10'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs font-mono">Calibrated On-Site Factory Sensor</span>
                {sensorMode === 'PHYSICAL_SENSOR' && <CheckCircle className="w-4 h-4 text-orange-400" />}
              </div>
              <p className="text-[11px] text-gray-400 font-mono mt-1">
                Reads physical indoor temperature probe on the shop floor to detect immediate factory heat hazards.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                Physical Sensor Reading (°C)
              </label>
              <input
                type="number"
                step="0.1"
                value={physicalTemp}
                onChange={(e) => setPhysicalTemp(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                Calibration Offset (°C)
              </label>
              <input
                type="number"
                step="0.1"
                value={calibrationOffset}
                onChange={(e) => setCalibrationOffset(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Biometric & AI Confidence Calibration */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Sliders className="w-4 h-4 text-orange-400" />
            <h3 className="font-bold text-white text-sm font-mono uppercase tracking-wider">
              3. AI Biometric & Inference Calibration
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                Worker Recognition Cosine Threshold ({confidenceThreshold})
              </label>
              <input
                type="range"
                min="0.90"
                max="0.99"
                step="0.01"
                value={confidenceThreshold}
                onChange={(e) => setConfidenceThreshold(e.target.value)}
                className="w-full accent-orange-500 cursor-pointer"
              />
              <span className="text-[10px] text-gray-400 font-mono">
                Standard: 0.98. Lower values increase match sensitivity; higher values reject strangers strictly.
              </span>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-gray-300 mb-1">
                Temporal Consensus Frames ({consensusFrames} frames)
              </label>
              <input
                type="range"
                min="3"
                max="10"
                step="1"
                value={consensusFrames}
                onChange={(e) => setConsensusFrames(e.target.value)}
                className="w-full accent-orange-500 cursor-pointer"
              />
              <span className="text-[10px] text-gray-400 font-mono">
                Consecutive frames required before locking worker identity and recording attendance.
              </span>
            </div>
          </div>
        </div>

        {/* Section 4: Storage & Role Policy */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <HardDrive className="w-4 h-4 text-orange-400" />
            <h3 className="font-bold text-white text-sm font-mono uppercase tracking-wider">
              4. Lightweight Storage & Role Information
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <span className="text-gray-400 block">Logged-in Account:</span>
              <span className="text-white font-bold">{manager?.full_name || 'Safety Administrator'}</span>
              <div className="text-[11px] text-orange-400 font-bold">ROLE: {manager?.role || 'ADMIN'}</div>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <span className="text-gray-400 block">Storage Growth Policy:</span>
              <span className="text-emerald-400 font-bold">LIGHTWEIGHT ZERO-VIDEO RETENTION</span>
              <div className="text-[11px] text-gray-500">
                Frames are processed in RAM; only deduplicated attendance metadata and violation events are stored.
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-xs font-bold text-white shadow-lg shadow-orange-600/30 cursor-pointer font-mono disabled:opacity-50 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving System Settings...' : 'Save & Synchronize Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
