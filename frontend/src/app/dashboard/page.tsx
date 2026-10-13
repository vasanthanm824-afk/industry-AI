'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  CalendarCheck,
  Video,
  ShieldCheck,
  AlertTriangle,
  CloudSun,
  ShieldAlert,
  ArrowUpRight,
  RefreshCw,
  Play,
  Square,
  Search,
  CheckCircle,
  HelpCircle,
  Thermometer,
  Zap,
  Activity,
  Briefcase,
  Sliders,
} from 'lucide-react';
import { apiFetch, getStoredManager } from '@/lib/api';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [manager, setManager] = useState<any>(null);

  // Live Webcam state
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFps, setCameraFps] = useState<number>(0);
  const [latencyMs, setLatencyMs] = useState<number>(0);

  // Dashboard Data State
  const [dashboardData, setDashboardData] = useState<{
    totalWorkers: number;
    presentToday: number;
    attendancePct: number;
    ppeComplianceRate: number;
    activeViolations: number;
    unknownPersonsCount: number;
    cameraStatus: string;
    temperatureC: number | string;
    weatherCondition: string;
    weatherHumidity: number | string;
    weatherWind: number | string;
    isWeatherStale: boolean;
    weatherSource: string;
    attendanceRecords: any[];
    violations: any[];
  }>({
    totalWorkers: 0,
    presentToday: 0,
    attendancePct: 0,
    ppeComplianceRate: 94.2,
    activeViolations: 0,
    unknownPersonsCount: 0,
    cameraStatus: 'IDLE / READY',
    temperatureC: '--',
    weatherCondition: 'Clear sky',
    weatherHumidity: '--',
    weatherWind: '--',
    isWeatherStale: false,
    weatherSource: 'Open-Meteo Weather API',
    attendanceRecords: [],
    violations: [],
  });

  // Table filters
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [violationStatusFilter, setViolationStatusFilter] = useState('ALL');
  const [violationSearch, setViolationSearch] = useState('');

  // Video & Canvas refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInferencingRef = useRef<boolean>(false);

  // Fetch telemetry and records from backend
  const fetchDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [workersRes, attRes, ppeRes, incRes, weatherRes, cctvRes] = await Promise.all([
        apiFetch('/workers').catch(() => ({ total: 0, workers: [] })),
        apiFetch(`/attendance?date=${today}`).catch(() => ({ total_present: 0, total_registered: 0, attendance_rate: 0, records: [] })),
        apiFetch('/ppe/summary').catch(() => ({ compliance_rate: 94 })),
        apiFetch('/incidents?limit=20').catch(() => ({ incidents: [] })),
        apiFetch('/weather').catch(() => null),
        apiFetch('/cctv/status').catch(() => null),
      ]);

      const totalWorkers = workersRes.total || (workersRes.workers ? workersRes.workers.length : 0);
      const presentToday = attRes.total_present || (attRes.records ? attRes.records.length : 0);
      const attendancePct = totalWorkers > 0 ? Math.round((presentToday / totalWorkers) * 100) : 0;
      const ppeRate = ppeRes.compliance_rate || 94.2;

      const incList = incRes.incidents || [];
      const openViolations = incList.filter((i: any) => i.status === 'OPEN' || i.status === 'ACKNOWLEDGED').length;

      // Count unknown detections from CCTV status
      const unknownCount = cctvRes?.active_workers_count ? Math.max(0, cctvRes.active_workers_count - (cctvRes.identified_count || 0)) : 0;

      let temp = '--';
      let cond = 'Clear sky';
      let hum = '--';
      let wind = '--';
      let stale = false;
      let source = 'Open-Meteo Weather API';

      if (weatherRes) {
        temp = weatherRes.temperature_c ?? '--';
        cond = weatherRes.condition || 'Partly cloudy';
        hum = weatherRes.humidity_pct ?? '--';
        wind = weatherRes.wind_speed_kmh ?? '--';
        stale = weatherRes.is_stale || false;
        source = weatherRes.source || 'Open-Meteo Weather API';
      }

      setDashboardData({
        totalWorkers,
        presentToday,
        attendancePct,
        ppeComplianceRate: ppeRate,
        activeViolations: openViolations,
        unknownPersonsCount: unknownCount,
        cameraStatus: isWebcamActive ? 'CONNECTED (WEBCAM)' : (cctvRes?.is_running ? 'STREAMING (CCTV)' : 'READY / STANDBY'),
        temperatureC: temp,
        weatherCondition: cond,
        weatherHumidity: hum,
        weatherWind: wind,
        isWeatherStale: stale,
        weatherSource: source,
        attendanceRecords: attRes.records || [],
        violations: incList,
      });
    } catch (e) {
      console.error('Failed to load dashboard telemetry:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setManager(getStoredManager());
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 4000);
    return () => clearInterval(interval);
  }, [isWebcamActive]);

  // Clean up webcam on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  // Stop Webcam
  const stopWebcam = () => {
    if (captureTimerRef.current) {
      clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
    isInferencingRef.current = false;
    setIsWebcamActive(false);
  };

  // Draw overlay on webcam
  const drawOverlay = (tracks: any[]) => {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const width = video.clientWidth || 1280;
    const height = video.clientHeight || 720;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    let unknownDetectedCount = 0;

    tracks.forEach((w: any) => {
      let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
      if (w.norm_bbox && w.norm_bbox.length === 4) {
        x1 = w.norm_bbox[0] * width;
        y1 = w.norm_bbox[1] * height;
        x2 = w.norm_bbox[2] * width;
        y2 = w.norm_bbox[3] * height;
      } else if (w.bbox && w.bbox.length === 4) {
        x1 = w.bbox[0];
        y1 = w.bbox[1];
        x2 = w.bbox[2];
        y2 = w.bbox[3];
      }

      const boxW = Math.max(10, x2 - x1);
      const boxH = Math.max(10, y2 - y1);

      const isRegistered = w.is_verified && w.worker_id;
      if (!isRegistered) unknownDetectedCount++;

      let strokeColor = '#10b981'; // Emerald SAFE
      let fillColor = 'rgba(16, 185, 129, 0.12)';
      if (w.safety_status && (w.safety_status.includes('VIOLATION') || w.overall_ppe_status === 'VIOLATION')) {
        strokeColor = '#f97316'; // Safety Orange
        fillColor = 'rgba(249, 115, 22, 0.16)';
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x1, y1, boxW, boxH, 6);
      else ctx.rect(x1, y1, boxW, boxH);
      ctx.fill();
      ctx.stroke();

      // Corner brackets
      const cornerLen = Math.min(16, boxW / 4, boxH / 4);
      ctx.lineWidth = 3;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();
      ctx.moveTo(x1, y1 + cornerLen); ctx.lineTo(x1, y1); ctx.lineTo(x1 + cornerLen, y1);
      ctx.moveTo(x2 - cornerLen, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + cornerLen);
      ctx.moveTo(x1, y2 - cornerLen); ctx.lineTo(x1, y2); ctx.lineTo(x1 + cornerLen, y2);
      ctx.moveTo(x2 - cornerLen, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - cornerLen);
      ctx.stroke();

      // Badge
      const nameText = isRegistered
        ? `${w.worker_name} (${w.worker_id}) | Mgr: ${w.allocated_manager || 'Kumar'}`
        : `UNKNOWN PERSON (Track #${w.track_id})`;
      const attText = isRegistered
        ? (w.attendance_status || 'Attendance Marked')
        : 'Unknown Worker — Attendance Not Marked';

      ctx.font = 'bold 11px monospace';
      const bW = Math.max(ctx.measureText(nameText).width, ctx.measureText(attText).width) + 16;
      const bH = 36;
      const bY = Math.max(0, y1 - bH - 3);

      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.fillRect(x1, bY, bW, bH);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, bY, bW, bH);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(nameText, x1 + 8, bY + 14);
      ctx.fillStyle = isRegistered ? '#34d399' : '#fb923c';
      ctx.font = '9px monospace';
      ctx.fillText(attText, x1 + 8, bY + 28);
    });

    if (unknownDetectedCount > 0) {
      setDashboardData((prev) => ({ ...prev, unknownPersonsCount: unknownDetectedCount }));
    }
  };

  const handleInferenceResult = (res: any) => {
    isInferencingRef.current = false;
    if (res.stats?.fps) setCameraFps(res.stats.fps);
    if (res.stats?.instant_latency_ms) setLatencyMs(Math.round(res.stats.instant_latency_ms));
    if (res.tracks) drawOverlay(res.tracks);
  };

  const sendNextFrameForInference = () => {
    if (!videoRef.current || !captureCanvasRef.current || isInferencingRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    const capCanvas = captureCanvasRef.current;
    const targetW = 640;
    const targetH = Math.round(targetW * (video.videoHeight / video.videoWidth)) || 360;
    if (capCanvas.width !== targetW || capCanvas.height !== targetH) {
      capCanvas.width = targetW;
      capCanvas.height = targetH;
    }

    const ctx = capCanvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, targetW, targetH);
    const dataUrl = capCanvas.toDataURL('image/jpeg', 0.65);

    isInferencingRef.current = true;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(dataUrl);
    } else {
      apiFetch('/cctv/frame-inference', {
        method: 'POST',
        body: JSON.stringify({ image: dataUrl }),
      })
        .then(handleInferenceResult)
        .catch(() => {
          isInferencingRef.current = false;
        });
    }
  };

  const startWebcam = async () => {
    stopWebcam();
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsWebcamActive(true);

      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = loc.port === '3000' ? `${loc.hostname}:8000` : loc.host;
      const wsUrl = `${wsProtocol}//${wsHost}/api/cctv/ws-inference`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          if (captureTimerRef.current) clearInterval(captureTimerRef.current);
          captureTimerRef.current = setInterval(sendNextFrameForInference, 45);
        };
        ws.onmessage = (event) => {
          try {
            handleInferenceResult(JSON.parse(event.data));
          } catch (_) {
            isInferencingRef.current = false;
          }
        };
        ws.onerror = () => {
          if (captureTimerRef.current) clearInterval(captureTimerRef.current);
          captureTimerRef.current = setInterval(sendNextFrameForInference, 75);
        };
      } catch (_) {
        if (captureTimerRef.current) clearInterval(captureTimerRef.current);
        captureTimerRef.current = setInterval(sendNextFrameForInference, 75);
      }
    } catch (err: any) {
      setCameraError(err.message || 'Could not access webcam.');
      setIsWebcamActive(false);
    }
  };

  // Acknowledge incident
  const handleAcknowledgeIncident = async (incidentId: string) => {
    try {
      await apiFetch(`/incidents/${incidentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACKNOWLEDGED', action_note: 'Acknowledged by Project Manager.' }),
      });
      fetchDashboardData();
    } catch (err: any) {
      alert(`Failed to acknowledge incident: ${err.message}`);
    }
  };

  // Resolve incident
  const handleResolveIncident = async (incidentId: string) => {
    try {
      await apiFetch(`/incidents/${incidentId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'RESOLVED', action_note: 'Resolved on-site by Manager.' }),
      });
      fetchDashboardData();
    } catch (err: any) {
      alert(`Failed to resolve incident: ${err.message}`);
    }
  };

  // Filtered attendance records
  const filteredAttendance = dashboardData.attendanceRecords.filter(
    (a: any) =>
      a.worker_name.toLowerCase().includes(attendanceSearch.toLowerCase()) ||
      a.worker_id.toLowerCase().includes(attendanceSearch.toLowerCase()) ||
      (a.allocated_manager && a.allocated_manager.toLowerCase().includes(attendanceSearch.toLowerCase()))
  );

  // Filtered violations
  const filteredViolations = dashboardData.violations.filter((v: any) => {
    const matchesStatus = violationStatusFilter === 'ALL' || v.status === violationStatusFilter;
    const matchesSearch =
      v.description.toLowerCase().includes(violationSearch.toLowerCase()) ||
      (v.worker_name && v.worker_name.toLowerCase().includes(violationSearch.toLowerCase())) ||
      (v.incident_id && v.incident_id.toLowerCase().includes(violationSearch.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-orange-400" />
            <h2 className="text-xl font-bold text-white tracking-wide font-mono">
              SENTINEL-X Real-Time Manager Dashboard
            </h2>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Autonomous industrial safety oversight, PPE compliance auditing, biometric attendance, and live camera feed.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-gray-300 border border-slate-700 transition-colors font-mono cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-orange-400" />
            <span>Sync Telemetry</span>
          </button>

          <Link
            href="/cctv"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-xs font-semibold text-white shadow-md shadow-orange-600/30 font-mono transition-all"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Open Camera Room</span>
          </Link>
        </div>
      </div>

      {/* ================= THE 9 REQUIRED DASHBOARD CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4">
        {/* Card 1: Total Registered Workers */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Total Registered Workers</span>
            <Users className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            {dashboardData.totalWorkers}
          </div>
          <div className="text-[11px] text-gray-500 font-mono mt-1">
            Enrolled biometric identity gallery
          </div>
        </div>

        {/* Card 2: Workers Present Today */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Workers Present Today</span>
            <CalendarCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            {dashboardData.presentToday}
          </div>
          <div className="text-[11px] text-emerald-400 font-mono mt-1">
            Marked once per worker per date
          </div>
        </div>

        {/* Card 3: Attendance Percentage */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Attendance Percentage</span>
            <ArrowUpRight className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            {dashboardData.attendancePct}%
          </div>
          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-2 border border-slate-800">
            <div
              className="bg-orange-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${dashboardData.attendancePct}%` }}
            />
          </div>
        </div>

        {/* Card 4: PPE Compliance Rate */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">PPE Compliance Rate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 mt-2">
            {dashboardData.ppeComplianceRate}%
          </div>
          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-2 border border-slate-800">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${dashboardData.ppeComplianceRate}%` }}
            />
          </div>
        </div>

        {/* Card 5: Active PPE Violations */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Active PPE Violations</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className={`text-2xl font-bold font-mono mt-2 ${dashboardData.activeViolations > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {dashboardData.activeViolations}
          </div>
          <div className="text-[11px] text-gray-500 font-mono mt-1">
            {dashboardData.activeViolations > 0 ? 'Requires manager review' : 'No active breaches'}
          </div>
        </div>

        {/* Card 6: Unknown Persons Detected */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Unknown Persons Detected</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-amber-400 mt-2">
            {dashboardData.unknownPersonsCount}
          </div>
          <div className="text-[11px] text-gray-500 font-mono mt-1">
            Unregistered in camera frame
          </div>
        </div>

        {/* Card 7: Camera Status */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Camera Status</span>
            <Video className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-sm font-bold font-mono text-white mt-2 flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isWebcamActive ? 'bg-red-500 animate-ping' : 'bg-emerald-500'}`}></span>
            {dashboardData.cameraStatus}
          </div>
          <div className="text-[11px] text-orange-400 font-mono mt-1">
            {isWebcamActive ? `${cameraFps.toFixed(1)} FPS | ${latencyMs}ms inference` : '1280x720 HD Ready'}
          </div>
        </div>

        {/* Card 8: Current Temperature */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Current Temperature</span>
            <Thermometer className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white mt-2">
            {dashboardData.temperatureC}°C
          </div>
          <div className="text-[11px] text-gray-500 font-mono mt-1 truncate" title={dashboardData.weatherSource}>
            {dashboardData.isWeatherStale ? 'Stale cache' : dashboardData.weatherSource}
          </div>
        </div>

        {/* Card 9: Current Weather Conditions */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">Current Weather Conditions</span>
            <CloudSun className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-base font-bold font-mono text-white mt-2 truncate">
            {dashboardData.weatherCondition}
          </div>
          <div className="text-[11px] text-gray-400 font-mono mt-1">
            Humidity: {dashboardData.weatherHumidity}% | Wind: {dashboardData.weatherWind} km/h
          </div>
        </div>
      </div>

      {/* ================= WEBCAM MONITORING PANEL ================= */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-orange-400" />
            <h3 className="font-bold text-white text-base font-mono">
              Prominent Webcam Monitoring Panel
            </h3>
          </div>

          <div className="flex items-center gap-2">
            {isWebcamActive ? (
              <button
                onClick={stopWebcam}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white cursor-pointer font-mono shadow-md"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Stop Webcam</span>
              </button>
            ) : (
              <button
                onClick={startWebcam}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white cursor-pointer font-mono shadow-md"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Webcam AI Feed</span>
              </button>
            )}

            <Link
              href="/cctv"
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-gray-300 border border-slate-700"
            >
              Full Camera Suite &rarr;
            </Link>
          </div>
        </div>

        {/* Video Screen */}
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video max-h-[460px] flex items-center justify-center border border-slate-800 shadow-2xl">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            className={`w-full h-full object-contain rounded-xl ${!isWebcamActive ? 'hidden' : ''}`}
          />
          <canvas
            ref={overlayCanvasRef}
            className={`absolute inset-0 w-full h-full pointer-events-none rounded-xl ${!isWebcamActive ? 'hidden' : 'block'}`}
          />

          {!isWebcamActive && (
            <div className="text-center p-8 space-y-3">
              <Video className="w-12 h-12 text-slate-700 mx-auto" />
              <div className="text-sm font-semibold text-white font-mono">
                Webcam Inactive (Click "Start Webcam AI Feed" to monitor)
              </div>
              <p className="text-xs text-gray-500 font-mono max-w-md mx-auto">
                Identifies registered workers, shows allocated manager, records single daily attendance, and continuously checks PPE compliance.
              </p>
            </div>
          )}

          {cameraError && (
            <div className="absolute inset-0 bg-red-950/90 flex items-center justify-center p-4">
              <div className="text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                <div className="text-sm text-red-200 font-mono font-bold">{cameraError}</div>
                <button
                  onClick={startWebcam}
                  className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-mono"
                >
                  Retry Permission
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= TWO-COLUMN MANAGER WORKFLOW: ATTENDANCE & VIOLATIONS ================= */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left Column: Today's Shift Attendance */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-white text-base font-mono flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-orange-400" />
                Today's Shift Attendance
              </h3>
              <p className="text-xs text-gray-400 font-mono">Marked once per session</p>
            </div>

            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search worker or manager..."
                value={attendanceSearch}
                onChange={(e) => setAttendanceSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950 text-gray-400 text-[10px] uppercase border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="p-2.5">Worker Name</th>
                  <th className="p-2.5">ID</th>
                  <th className="p-2.5">Allocated Manager</th>
                  <th className="p-2.5">Check-in</th>
                  <th className="p-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredAttendance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      No attendance marked yet today. Confidently identified workers appear here automatically once.
                    </td>
                  </tr>
                ) : (
                  filteredAttendance.map((a: any) => (
                    <tr key={a.id} className="hover:bg-slate-800/40">
                      <td className="p-2.5 font-bold text-white">{a.worker_name}</td>
                      <td className="p-2.5 text-orange-400 font-bold">{a.worker_id}</td>
                      <td className="p-2.5 text-gray-300">
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3 h-3 text-orange-400" />
                          {a.allocated_manager || 'Unassigned'}
                        </span>
                      </td>
                      <td className="p-2.5 text-gray-300">{a.first_seen_time}</td>
                      <td className="p-2.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                          {a.attendance_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: PPE Violations & Incidents */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-white text-base font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Active PPE Violations & Incidents
              </h3>
              <p className="text-xs text-gray-400 font-mono">Manager review and resolution</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={violationStatusFilter}
                onChange={(e) => setViolationStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
              >
                <option value="ALL">All Status</option>
                <option value="OPEN">Open</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
            {filteredViolations.length === 0 ? (
              <div className="p-8 text-center text-emerald-400 font-mono text-xs border border-dashed border-slate-800 rounded-xl">
                No active safety violations recorded.
              </div>
            ) : (
              filteredViolations.map((v: any) => (
                <div
                  key={v.incident_id}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white font-mono flex items-center gap-2">
                        <span>{v.incident_type}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-950 text-red-400 border border-red-800">
                          {v.severity}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                        Worker: <span className="text-white font-semibold">{v.worker_name || 'UNKNOWN PERSON'}</span> {v.worker_id && `(${v.worker_id})`} | Zone: {v.zone}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                        v.status === 'RESOLVED'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : v.status === 'ACKNOWLEDGED'
                          ? 'bg-amber-950 text-amber-400 border-amber-800'
                          : 'bg-red-950 text-red-400 border-red-800'
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>

                  <p className="text-xs text-gray-300 font-mono leading-relaxed">
                    {v.description}
                  </p>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-900 text-[10px] font-mono text-gray-500">
                    <span>{v.timestamp ? v.timestamp.replace('T', ' ').slice(0, 19) : ''}</span>
                    <div className="flex gap-2">
                      {v.status === 'OPEN' && (
                        <button
                          onClick={() => handleAcknowledgeIncident(v.incident_id)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 cursor-pointer"
                        >
                          Acknowledge
                        </button>
                      )}
                      {v.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleResolveIncident(v.incident_id)}
                          className="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 cursor-pointer"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
