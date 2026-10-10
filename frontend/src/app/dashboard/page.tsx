'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  CalendarCheck,
  Video,
  ShieldCheck,
  AlertTriangle,
  Bell,
  CloudSun,
  ShieldAlert,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
  Play,
  Square,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [data, setData] = useState<{
    workersTotal: number;
    presentToday: number;
    activeDetected: number;
    ppeCompliance: number;
    activeViolations: number;
    restrictedViolations: number;
    openIncidents: number;
    criticalAlerts: number;
    weather: any;
    safetyOverview: any;
    detections: any[];
    recentIncidents: any[];
  }>({
    workersTotal: 0,
    presentToday: 0,
    activeDetected: 0,
    ppeCompliance: 0,
    activeViolations: 0,
    restrictedViolations: 0,
    openIncidents: 0,
    criticalAlerts: 0,
    weather: null,
    safetyOverview: null,
    detections: [],
    recentIncidents: [],
  });

  // Video & Canvas refs for Live Laptop Webcam
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isInferencingRef = useRef<boolean>(false);

  // Draw tight AI bounding box overlay on top of 30 FPS live webcam feed
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

      let strokeColor = '#10b981'; // Emerald SAFE
      let fillColor = 'rgba(16, 185, 129, 0.12)';
      if (w.safety_status === 'PPE_VIOLATION') {
        strokeColor = '#f59e0b'; // Amber
        fillColor = 'rgba(245, 158, 11, 0.16)';
      } else if (w.safety_status === 'RESTRICTED_ZONE_VIOLATION' || w.safety_status === 'MULTIPLE_VIOLATIONS') {
        strokeColor = '#ef4444'; // Red
        fillColor = 'rgba(239, 68, 68, 0.22)';
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
      const cornerLen = Math.min(18, boxW / 4, boxH / 4);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = strokeColor;

      // Top-Left
      ctx.beginPath();
      ctx.moveTo(x1, y1 + cornerLen);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 + cornerLen, y1);
      ctx.stroke();

      // Top-Right
      ctx.beginPath();
      ctx.moveTo(x2 - cornerLen, y1);
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y1 + cornerLen);
      ctx.stroke();

      // Bottom-Left
      ctx.beginPath();
      ctx.moveTo(x1, y2 - cornerLen);
      ctx.lineTo(x1, y2);
      ctx.lineTo(x1 + cornerLen, y2);
      ctx.stroke();

      // Bottom-Right
      ctx.beginPath();
      ctx.moveTo(x2 - cornerLen, y2);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2, y2 - cornerLen);
      ctx.stroke();

      // Header Badge
      const labelName = w.worker_name && w.worker_name !== 'UNKNOWN' ? w.worker_name : `Person #${w.track_id}`;
      const confPct = w.confidence ? Math.round(w.confidence * 100) : 0;
      const labelText = `${labelName} | Track #${w.track_id} (${confPct}%)`;
      ctx.font = 'bold 11px monospace';
      const textMetrics = ctx.measureText(labelText);
      const badgeW = textMetrics.width + 16;
      const badgeH = 20;

      const badgeY = Math.max(0, y1 - badgeH - 3);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(x1, badgeY, badgeW, badgeH);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, badgeY, badgeW, badgeH);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(labelText, x1 + 8, badgeY + 14);
    });
  };

  const handleInferenceResult = (res: any) => {
    isInferencingRef.current = false;
    if (res.tracks) {
      drawOverlay(res.tracks);
      setData((prev) => {
        const activeViol = res.tracks.filter((d: any) =>
          ['PPE_VIOLATION', 'RESTRICTED_ZONE_VIOLATION', 'MULTIPLE_VIOLATIONS'].includes(d.safety_status)
        ).length;
        const restrictedViol = res.tracks.filter(
          (d: any) => d.safety_status === 'RESTRICTED_ZONE_VIOLATION' || d.zone_type === 'RESTRICTED'
        ).length;

        return {
          ...prev,
          activeDetected: res.tracks.length,
          activeViolations: activeViol,
          restrictedViolations: restrictedViol,
          detections: res.tracks,
        };
      });
    }
  };

  const sendNextFrameForInference = () => {
    if (!videoRef.current || !captureCanvasRef.current || isInferencingRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

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

      const startLoop = () => {
        if (captureTimerRef.current) clearInterval(captureTimerRef.current);
        captureTimerRef.current = setInterval(sendNextFrameForInference, 40);
      };

      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = loc.port === '3000' ? `${loc.hostname}:8000` : loc.host;
      const wsUrl = `${wsProtocol}//${wsHost}/api/cctv/ws-inference`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          startLoop();
        };

        ws.onmessage = (event) => {
          try {
            const res = JSON.parse(event.data);
            handleInferenceResult(res);
          } catch (e) {
            isInferencingRef.current = false;
          }
        };

        ws.onerror = () => {
          startLoop();
        };

        ws.onclose = () => {
          if (isWebcamActive) startLoop();
        };
      } catch (wsErr) {
        startLoop();
      }
    } catch (err: any) {
      console.warn('Dashboard webcam init failed:', err);
      setCameraError(err.message || 'Could not start laptop webcam.');
      setIsWebcamActive(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const [workersRes, attendanceRes, detectionsRes, ppeRes, safetyRes, weatherRes, incidentsRes, alertsRes] =
        await Promise.all([
          apiFetch('/workers').catch(() => ({ total: 0 })),
          apiFetch('/attendance').catch(() => ({ total_present: 0 })),
          apiFetch('/detections').catch(() => ({ active_count: 0, detections: [] })),
          apiFetch('/ppe/summary').catch(() => ({ compliance_rate: 0 })),
          apiFetch('/safety/status').catch(() => null),
          apiFetch('/weather').catch(() => null),
          apiFetch('/incidents?limit=5').catch(() => ({ incidents: [], summary: {} })),
          apiFetch('/alerts?unread_only=true').catch(() => ({ unread_count: 0, alerts: [] })),
        ]);

      const detectionsList = detectionsRes.detections || [];
      const activeViol = detectionsList.filter((d: any) =>
        ['PPE_VIOLATION', 'RESTRICTED_ZONE_VIOLATION', 'MULTIPLE_VIOLATIONS'].includes(d.safety_status)
      ).length;
      const restrictedViol = detectionsList.filter(
        (d: any) => d.safety_status === 'RESTRICTED_ZONE_VIOLATION' || d.zone_type === 'RESTRICTED'
      ).length;

      const critAlerts = (alertsRes.alerts || []).filter((a: any) => a.severity === 'CRITICAL').length;

      setData((prev) => ({
        ...prev,
        workersTotal: workersRes.total || 0,
        presentToday: attendanceRes.total_present || 0,
        activeDetected: prev.activeDetected || detectionsRes.active_count || 0,
        ppeCompliance: ppeRes.compliance_rate || 0,
        activeViolations: prev.activeViolations || activeViol,
        restrictedViolations: prev.restrictedViolations || restrictedViol,
        openIncidents: incidentsRes.summary?.open_incidents || 0,
        criticalAlerts: critAlerts || alertsRes.unread_count || 0,
        weather: weatherRes,
        safetyOverview: safetyRes,
        detections: prev.detections.length > 0 ? prev.detections : detectionsList,
        recentIncidents: incidentsRes.incidents || [],
      }));
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    startWebcam();

    const interval = setInterval(fetchDashboardData, 3000);
    return () => {
      clearInterval(interval);
      stopWebcam();
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SAFE':
        return 'bg-emerald-950/70 border-emerald-800 text-emerald-400';
      case 'PPE_VIOLATION':
        return 'bg-amber-950/70 border-amber-800 text-amber-400';
      case 'RESTRICTED_ZONE_VIOLATION':
      case 'MULTIPLE_VIOLATIONS':
        return 'bg-red-950/70 border-red-800 text-red-400';
      default:
        return 'bg-slate-900 border-slate-700 text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden offscreen canvas for downscaled 640x360 frame encoding */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-5 rounded-2xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-white tracking-wide">Facility Safety Operations Center</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-950/80 border border-red-700 text-red-400 font-mono font-bold animate-pulse">
              LIVE WEBCAM AI
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Real-time multi-worker tracking, automated attendance, PPE verification, and spatial geofencing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isWebcamActive ? (
            <button
              onClick={stopWebcam}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-500 text-xs font-semibold text-white shadow-md transition-all cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Camera</span>
            </button>
          ) : (
            <button
              onClick={startWebcam}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start Camera</span>
            </button>
          )}

          <button
            onClick={() => fetchDashboardData()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-xs text-gray-300 transition-colors border border-industrial-700 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-safety-cyan" />
            <span>Sync</span>
          </button>
          <Link
            href="/cctv"
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white shadow-md shadow-blue-600/30 transition-all"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Open Live CCTV Room</span>
          </Link>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {/* Workers Present */}
        <div className="glass-card p-4 rounded-xl border border-industrial-700/50">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Present Today</span>
            <CalendarCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{data.presentToday}</div>
          <div className="text-[11px] text-gray-400 mt-1">
            of {data.workersTotal} Registered Workers
          </div>
        </div>

        {/* Active Detected Workers */}
        <div className="glass-card p-4 rounded-xl border border-industrial-700/50">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">In Frame Now</span>
            <Users className="w-4 h-4 text-safety-cyan" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{data.activeDetected}</div>
          <div className="text-[11px] text-gray-400 mt-1">Live ByteTrack Tracks</div>
        </div>

        {/* PPE Compliance */}
        <div className="glass-card p-4 rounded-xl border border-industrial-700/50">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">PPE Compliance</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{data.ppeCompliance}%</div>
          <div className="text-[11px] text-gray-400 mt-1">Helmet, Vest & Gloves</div>
        </div>

        {/* Active Violations */}
        <div className="glass-card p-4 rounded-xl border border-industrial-700/50">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Live Violations</span>
            <AlertTriangle className={`w-4 h-4 ${data.activeViolations > 0 ? 'text-red-400' : 'text-gray-400'}`} />
          </div>
          <div className={`text-2xl font-bold font-mono ${data.activeViolations > 0 ? 'text-red-400' : 'text-white'}`}>
            {data.activeViolations}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">Zone & PPE Breaches</div>
        </div>

        {/* Weather Risk */}
        <div className="glass-card p-4 rounded-xl border border-industrial-700/50 col-span-2 md:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-mono uppercase tracking-wider">Weather Hazard</span>
            <CloudSun className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold text-white font-mono flex items-center gap-2">
            <span>{data.weather?.temperature_c != null ? `${data.weather.temperature_c}°C` : '--'}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                data.weather?.risk_level === 'SAFE'
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                  : 'bg-amber-950/60 border-amber-800 text-amber-400'
              }`}
            >
              {data.weather?.risk_level || 'SAFE'}
            </span>
          </div>
          <div className="text-[11px] text-gray-400 mt-1 truncate">
            {data.weather?.condition || 'Analyzing...'}
          </div>
        </div>
      </div>

      {/* Main Monitoring Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Laptop Webcam Stream Viewport */}
        <div className="lg:col-span-2 glass-panel p-5 rounded-2xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              <h3 className="font-semibold text-white text-sm tracking-wide">
                Primary CCTV Live Webcam Feed [LAPTOP-CAM-01]
              </h3>
            </div>
            <Link
              href="/cctv"
              className="text-xs text-safety-cyan hover:underline flex items-center gap-1 font-mono"
            >
              Full Screen Room <ExternalLink className="w-3 h-3" />
            </Link>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-industrial-700/60 shadow-xl">
            {cameraError ? (
              <div className="text-center p-6 space-y-3">
                <ShieldAlert className="w-10 h-10 text-red-500 mx-auto" />
                <div className="text-xs text-red-300 font-mono">{cameraError}</div>
                <button
                  onClick={startWebcam}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white"
                >
                  Enable Camera
                </button>
              </div>
            ) : (
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Native 30 FPS Live Laptop Webcam Stream */}
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  className={`w-full h-full object-contain rounded-xl ${!isWebcamActive ? 'hidden' : ''}`}
                />

                {/* Real-time Bounding Box AI Overlay Canvas */}
                <canvas
                  ref={overlayCanvasRef}
                  className={`absolute inset-0 w-full h-full pointer-events-none rounded-xl ${
                    isWebcamActive ? 'block' : 'hidden'
                  }`}
                />

                {!isWebcamActive && (
                  <div className="text-center p-8 space-y-3">
                    <RefreshCw className="w-8 h-8 text-safety-cyan mx-auto animate-spin" />
                    <div className="text-sm font-semibold text-white">
                      Click "Start Camera" to enable Live Laptop Webcam
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Camera Tag Overlay */}
            <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded text-[11px] font-mono text-white border border-white/10 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              LIVE WEBCAM | 30 FPS | ByteTrack AI
            </div>
          </div>
        </div>

        {/* Right 1 Col: Active Detected Personnel HUD */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white text-sm tracking-wide">
              Active Workers in Frame ({data.detections.length})
            </h3>
            <span className="text-[10px] font-mono text-gray-400">UPDATED REAL-TIME</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 max-h-[360px] pr-1">
            {data.detections.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs font-mono">
                No workers currently detected in camera view.
              </div>
            ) : (
              data.detections.map((w: any) => (
                <div
                  key={w.track_id}
                  className="p-3 rounded-xl bg-industrial-950/70 border border-industrial-800 space-y-2 hover:border-industrial-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                        {w.worker_name && w.worker_name !== 'UNKNOWN' ? w.worker_name : `Person #${w.track_id}`}
                        {w.worker_id && (
                          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-800">
                            {w.worker_id}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400">
                        Track #{w.track_id} | {w.zone_name || 'General Area'}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getStatusColor(
                        w.safety_status
                      )}`}
                    >
                      {w.safety_status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* PPE Chips */}
                  <div className="flex items-center gap-2 text-[10px] font-mono pt-1 border-t border-industrial-900">
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        w.helmet_status === 'COMPLIANT' || w.helmet_status === 'PASS'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                          : 'bg-red-950/80 text-red-400 border border-red-800'
                      }`}
                    >
                      Helmet: {w.helmet_status === 'COMPLIANT' || w.helmet_status === 'PASS' ? 'PASS' : 'FAIL'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        w.vest_status === 'COMPLIANT' || w.vest_status === 'PASS'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                          : 'bg-red-950/80 text-red-400 border border-red-800'
                      }`}
                    >
                      Vest: {w.vest_status === 'COMPLIANT' || w.vest_status === 'PASS' ? 'PASS' : 'FAIL'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded ${
                        w.gloves_status === 'COMPLIANT' || w.gloves_status === 'PASS'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                          : 'bg-slate-900 text-slate-400 border border-slate-700'
                      }`}
                    >
                      Gloves: {w.gloves_status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Incidents Table */}
      <div className="glass-panel p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-white text-sm tracking-wide">Recent Safety Incidents & Action Log</h3>
            <p className="text-xs text-gray-400">Automatically logged with evidence snapshots.</p>
          </div>
          <Link
            href="/incidents"
            className="text-xs text-safety-cyan hover:underline flex items-center gap-1 font-mono"
          >
            View All Incidents <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-industrial-950/80 text-gray-400 font-mono uppercase text-[10px] border-b border-industrial-800">
              <tr>
                <th className="py-2.5 px-3">Incident ID</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Worker / Track</th>
                <th className="py-2.5 px-3">Zone</th>
                <th className="py-2.5 px-3">Severity</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-800/60 font-mono">
              {data.recentIncidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-400">
                    No safety incidents recorded today.
                  </td>
                </tr>
              ) : (
                data.recentIncidents.map((inc: any) => (
                  <tr key={inc.incident_id} className="hover:bg-industrial-800/40">
                    <td className="py-2.5 px-3 text-white font-bold">{inc.incident_id}</td>
                    <td className="py-2.5 px-3 text-gray-300">{inc.incident_type}</td>
                    <td className="py-2.5 px-3 text-gray-300 font-sans">
                      {inc.worker_name} {inc.worker_id && `(${inc.worker_id})`}
                    </td>
                    <td className="py-2.5 px-3 text-gray-400">{inc.zone}</td>
                    <td className="py-2.5 px-3">
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
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] ${
                          inc.status === 'RESOLVED'
                            ? 'bg-emerald-950 text-emerald-400'
                            : inc.status === 'ACKNOWLEDGED'
                            ? 'bg-amber-950 text-amber-400'
                            : 'bg-red-950 text-red-400'
                        }`}
                      >
                        {inc.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <Link
                        href={`/incidents?focus=${inc.incident_id}`}
                        className="text-safety-cyan hover:underline"
                      >
                        Review
                      </Link>
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
