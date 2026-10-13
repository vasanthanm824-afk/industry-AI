'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Video,
  Play,
  Square,
  Camera,
  Users,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Compass,
  Sliders,
  CheckCircle2,
  XCircle,
  HelpCircle,
  EyeOff,
  Zap,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function CCTVPage() {
  const [sourceType, setSourceType] = useState<string>('webcam'); // 'webcam', 'sample', or 'webcam_<deviceId>'
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraSettings, setCameraSettings] = useState<any>({ width: 1280, height: 720, frameRate: 30, label: 'Integrated Webcam' });
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'overlay' | 'annotated'>('overlay');

  // Status and Detections state
  const [status, setStatus] = useState<any>(null);
  const [detections, setDetections] = useState<any[]>([]);
  const [annotatedFrameUrl, setAnnotatedFrameUrl] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);

  // Video & Canvas refs for Webcam capture and overlay rendering
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const captureTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Single in-flight frame tracking to prevent frame queue accumulation
  const isInferencingRef = useRef<boolean>(false);
  const lastFrameTimeRef = useRef<number>(0);

  // Enumerate video devices on mount
  useEffect(() => {
    async function enumerate() {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const vDevs = devices.filter((d) => d.kind === 'videoinput');
          setVideoDevices(vDevs);
          if (vDevs.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(vDevs[0].deviceId);
          }
        } catch (e) {
          console.warn('Could not enumerate video devices:', e);
        }
      }
    }
    enumerate();
  }, []);

  // Poll status when in sample mode
  const fetchSampleStatus = async () => {
    try {
      const [sRes, dRes] = await Promise.all([
        apiFetch('/cctv/status'),
        apiFetch('/detections'),
      ]);
      setStatus(sRes);
      setDetections(dRes.detections || []);
    } catch (e) {
      console.error('Failed to query CCTV status:', e);
    }
  };

  useEffect(() => {
    if (sourceType === 'sample') {
      fetchSampleStatus();
      const interval = setInterval(fetchSampleStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [sourceType]);

  // Clean up webcam and WebSocket on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  // Stop Webcam stream and WebSocket cleanly
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
    setWsConnected(false);
  };

  // Draw smooth AI bounding box overlay on top of native 30 FPS video feed
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

      // Color coding per safety status
      let strokeColor = '#10b981'; // Emerald SAFE
      let fillColor = 'rgba(16, 185, 129, 0.12)';
      if (w.safety_status === 'PPE_VIOLATION') {
        strokeColor = '#f59e0b'; // Amber
        fillColor = 'rgba(245, 158, 11, 0.16)';
      } else if (w.safety_status === 'RESTRICTED_ZONE_VIOLATION' || w.safety_status === 'MULTIPLE_VIOLATIONS') {
        strokeColor = '#ef4444'; // Red
        fillColor = 'rgba(239, 68, 68, 0.22)';
      }

      // Main box outline and semi-transparent fill
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x1, y1, boxW, boxH, 6);
      } else {
        ctx.rect(x1, y1, boxW, boxH);
      }
      ctx.fill();
      ctx.stroke();

      // High-tech HUD Corner Brackets
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

      // Header Label Badge (Worker ID / Name / Track ID)
      // Header Label Badge (Worker Name / ID / Allocated Manager / Attendance)
      const isRegistered = w.is_verified && w.worker_id;
      const labelName = isRegistered
        ? `${w.worker_name} (${w.worker_id}) | Mgr: ${w.allocated_manager || 'Kumar'}`
        : `UNKNOWN PERSON (Track #${w.track_id})`;
      const confPct = w.confidence ? Math.round(w.confidence * 100) : 0;
      const attText = isRegistered
        ? (w.attendance_status || 'Attendance Marked')
        : 'Unknown Worker — Attendance Not Marked';

      const line1 = `${labelName} (${confPct}%)`;
      const line2 = `Status: ${w.safety_status || 'SAFE'} | ${attText}`;

      ctx.font = 'bold 11px monospace';
      const m1 = ctx.measureText(line1).width;
      ctx.font = '9px monospace';
      const m2 = ctx.measureText(line2).width;
      const badgeW = Math.max(m1, m2) + 16;
      const badgeH = 34;

      const badgeY = Math.max(0, y1 - badgeH - 3);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
      ctx.fillRect(x1, badgeY, badgeW, badgeH);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, badgeY, badgeW, badgeH);

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line1, x1 + 8, badgeY + 14);

      ctx.font = '9px monospace';
      ctx.fillStyle = isRegistered ? '#34d399' : '#fb923c';
      ctx.fillText(line2, x1 + 8, badgeY + 27);

      // Mini PPE Compliance Pills underneath box
      const ppeItems = [
        { name: 'HELMET', status: w.helmet_status },
        { name: 'VEST', status: w.vest_status },
        { name: 'GLOVES', status: w.gloves_status },
        { name: 'BOOTS', status: w.boots_status },
      ];

      let pillX = x1;
      const pillY = y2 + 4;
      ctx.font = '9px monospace';

      ppeItems.forEach((item) => {
        let pBg = 'rgba(30, 41, 59, 0.85)';
        let pTxt = '#94a3b8';
        let statusStr = '?';

        if (item.status === 'COMPLIANT' || item.status === 'PASS') {
          pBg = 'rgba(6, 78, 59, 0.9)';
          pTxt = '#34d399';
          statusStr = 'PASS';
        } else if (item.status === 'VIOLATION' || item.status === 'FAIL') {
          pBg = 'rgba(127, 29, 29, 0.9)';
          pTxt = '#f87171';
          statusStr = 'FAIL';
        } else if (item.status === 'NOT VISIBLE') {
          pBg = 'rgba(15, 23, 42, 0.85)';
          pTxt = '#64748b';
          statusStr = 'N/V';
        }

        const pillText = `${item.name}:${statusStr}`;
        const pWidth = ctx.measureText(pillText).width + 6;

        ctx.fillStyle = pBg;
        ctx.fillRect(pillX, pillY, pWidth, 14);
        ctx.fillStyle = pTxt;
        ctx.fillText(pillText, pillX + 3, pillY + 10);

        pillX += pWidth + 3;
      });
    });
  };

  // Process incoming AI inference result
  const handleInferenceResult = (res: any) => {
    isInferencingRef.current = false;
    const now = performance.now();
    if (lastFrameTimeRef.current > 0) {
      const roundTrip = Math.round(now - lastFrameTimeRef.current);
      setLatencyMs(roundTrip);
    }

    if (res.tracks) {
      setDetections(res.tracks);
      drawOverlay(res.tracks);
    }

    if (res.image) {
      setAnnotatedFrameUrl(res.image);
    }

    if (res.stats) {
      setStatus({
        is_running: true,
        source: 'Laptop Webcam (Realtime AI)',
        fps: res.stats.fps || 0.0,
        frame_index: res.stats.frame_index || 0,
        active_workers_count: res.stats.active_workers || 0,
        total_unique_tracks: res.stats.total_unique_tracks || 0,
        violations_count: res.stats.violations_count || 0,
        weather_risk: res.stats.weather_risk || 'SAFE',
      });
      if (res.stats.instant_latency_ms) {
        setLatencyMs(Math.round(res.stats.instant_latency_ms));
      }
    }
  };

  // Dispatch single frame for inference only when backend is ready (prevents lag & queue buildup)
  const sendNextFrameForInference = () => {
    if (!videoRef.current || !captureCanvasRef.current || isInferencingRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

    const capCanvas = captureCanvasRef.current;
    // Downscale for lightweight base64 payload & rapid CPU inference
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
    lastFrameTimeRef.current = performance.now();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(dataUrl);
    } else {
      // HTTP REST Fallback
      apiFetch('/cctv/frame-inference', {
        method: 'POST',
        body: JSON.stringify({ image: dataUrl }),
      })
        .then(handleInferenceResult)
        .catch((err) => {
          console.warn('HTTP frame inference error:', err);
          isInferencingRef.current = false;
        });
    }
  };

  // Start Laptop / USB Webcam and setup high-performance inference loop
  const startWebcam = async (deviceIdToUse?: string) => {
    stopWebcam();
    setCameraError(null);
    setLoading(true);

    try {
      const targetDeviceId = deviceIdToUse || selectedDeviceId;
      const constraints: MediaStreamConstraints = {
        video: targetDeviceId
          ? { deviceId: { exact: targetDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings ? track.getSettings() : {};
        setCameraSettings({
          width: settings.width || 1280,
          height: settings.height || 720,
          frameRate: Math.round(settings.frameRate || 30),
          label: track.label || 'Laptop Webcam',
        });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsWebcamActive(true);

      // Start Frame Ingestion Interval (~25 FPS ticker, drops stale frames automatically)
      const startInferenceLoop = () => {
        if (captureTimerRef.current) clearInterval(captureTimerRef.current);
        captureTimerRef.current = setInterval(() => {
          sendNextFrameForInference();
        }, 40);
      };

      // Connect to WebSocket backend inference endpoint
      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = loc.port === '3000' ? `${loc.hostname}:8000` : loc.host;
      const wsUrl = `${wsProtocol}//${wsHost}/api/cctv/ws-inference`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setWsConnected(true);
          setCameraError(null);
          startInferenceLoop();
        };

        ws.onmessage = (event) => {
          try {
            const res = JSON.parse(event.data);
            handleInferenceResult(res);
          } catch (e) {
            console.error('Error parsing WebSocket frame response:', e);
            isInferencingRef.current = false;
          }
        };

        ws.onerror = (err) => {
          console.warn('WebSocket error, switching to HTTP REST fallback loop:', err);
          setWsConnected(false);
          startInferenceLoop();
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (isWebcamActive) {
            startInferenceLoop();
          }
        };
      } catch (wsErr) {
        console.warn('WebSocket init failed, activating HTTP fallback loop:', wsErr);
        startInferenceLoop();
      }
    } catch (err: any) {
      console.error('Webcam access failed:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Camera permission denied by user. Please grant permission in browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('No webcam device found on this laptop/computer.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setCameraError('Webcam is occupied or in use by another application.');
      } else {
        setCameraError(`Camera Error: ${err.message || 'Could not start webcam stream.'}`);
      }
      setIsWebcamActive(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSourceChange = (newSource: string) => {
    setSourceType(newSource);
    setAnnotatedFrameUrl(null);
    setDetections([]);

    if (newSource === 'sample') {
      stopWebcam();
    } else if (newSource.startsWith('webcam')) {
      const devId = newSource.includes('_') ? newSource.split('_')[1] : '';
      setSelectedDeviceId(devId);
      startWebcam(devId);
    }
  };

  const handleStartPipeline = async () => {
    if (sourceType.startsWith('webcam')) {
      startWebcam();
    } else {
      setLoading(true);
      try {
        await apiFetch('/cctv/start', { method: 'POST' });
        setStreamError(false);
        fetchSampleStatus();
      } finally {
        setLoading(false);
      }
    }
  };

  const handleStopPipeline = async () => {
    if (sourceType.startsWith('webcam')) {
      stopWebcam();
    } else {
      setLoading(true);
      try {
        await apiFetch('/cctv/stop', { method: 'POST' });
        fetchSampleStatus();
      } finally {
        setLoading(false);
      }
    }
  };

  const getStatusColor = (safetyStatus: string) => {
    switch (safetyStatus) {
      case 'SAFE':
        return 'text-emerald-400 bg-emerald-950/80 border-emerald-800';
      case 'PPE_VIOLATION':
        return 'text-amber-400 bg-amber-950/80 border-amber-800';
      case 'RESTRICTED_ZONE_VIOLATION':
      case 'MULTIPLE_VIOLATIONS':
        return 'text-red-400 bg-red-950/80 border-red-800';
      default:
        return 'text-gray-400 bg-industrial-900 border-industrial-700';
    }
  };

  const renderPPEBadge = (label: string, statusVal: string) => {
    let colorClass = 'bg-slate-900/80 border-slate-700 text-slate-400';
    let icon = <HelpCircle className="w-2.5 h-2.5 inline mr-0.5 text-slate-400" />;
    let text = 'UNKNOWN';

    if (statusVal === 'COMPLIANT' || statusVal === 'PASS') {
      colorClass = 'bg-emerald-950/80 border-emerald-800 text-emerald-400';
      icon = <CheckCircle2 className="w-2.5 h-2.5 inline mr-0.5 text-emerald-400" />;
      text = 'PASS';
    } else if (statusVal === 'VIOLATION' || statusVal === 'FAIL') {
      colorClass = 'bg-red-950/80 border-red-800 text-red-400';
      icon = <XCircle className="w-2.5 h-2.5 inline mr-0.5 text-red-400" />;
      text = 'FAIL';
    } else if (statusVal === 'NOT VISIBLE') {
      colorClass = 'bg-industrial-900 border-industrial-700 text-gray-500';
      icon = <EyeOff className="w-2.5 h-2.5 inline mr-0.5 text-gray-500" />;
      text = 'N/V';
    }

    return (
      <div className={`py-1 px-1 rounded border text-[10px] font-mono text-center ${colorClass}`}>
        <span className="block text-[9px] text-gray-400 leading-tight">{label}</span>
        <span className="font-bold flex items-center justify-center gap-0.5 mt-0.5">
          {icon}
          {text}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Hidden capture canvas for lightweight frame encoding */}
      <canvas ref={captureCanvasRef} className="hidden" />

      {/* Top Header & Stream Controls */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-white tracking-wide">Live CCTV Monitoring Room</h2>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-medium border ${
                (sourceType.startsWith('webcam') && isWebcamActive) || status?.is_running
                  ? 'bg-red-950/80 border-red-700 text-red-400 animate-pulse'
                  : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}
            >
              {(sourceType.startsWith('webcam') && isWebcamActive) || status?.is_running
                ? 'LIVE WEBCAM STREAM'
                : 'IDLE / STANDBY'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            INFERENCE ENGINE: YOLOv8 + ByteTrack + 6-Category PPE Compliance + Biometric Verification
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* View Mode Toggle for Webcam */}
          {sourceType.startsWith('webcam') && isWebcamActive && (
            <div className="flex items-center bg-industrial-950 border border-industrial-800 rounded-lg p-1 text-xs">
              <button
                onClick={() => setViewMode('overlay')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  viewMode === 'overlay' ? 'bg-safety-cyan text-black font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Realtime 30FPS + Overlay
              </button>
              <button
                onClick={() => setViewMode('annotated')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  viewMode === 'annotated' ? 'bg-safety-cyan text-black font-bold' : 'text-gray-400 hover:text-white'
                }`}
              >
                Annotated Stream
              </button>
            </div>
          )}

          {/* Camera Source Selector */}
          <div className="flex items-center gap-2 bg-industrial-900 border border-industrial-700 rounded-lg px-3 py-1.5 text-xs text-white">
            <Sliders className="w-3.5 h-3.5 text-safety-cyan" />
            <select
              value={sourceType}
              onChange={(e) => handleSourceChange(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="webcam" className="bg-industrial-900 text-white">
                Laptop Webcam (Internal)
              </option>
              {videoDevices.map((d, idx) => (
                <option key={d.deviceId} value={`webcam_${d.deviceId}`} className="bg-industrial-900 text-white">
                  {d.label || `External USB Camera #${idx + 1}`}
                </option>
              ))}
              <option value="sample" className="bg-industrial-900 text-white">
                Sample CCTV Video Loop
              </option>
            </select>
          </div>

          {(sourceType.startsWith('webcam') && isWebcamActive) || status?.is_running ? (
            <button
              onClick={handleStopPipeline}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600/90 hover:bg-red-500 text-xs font-semibold text-white shadow-md shadow-red-600/30 transition-all cursor-pointer"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Stream</span>
            </button>
          ) : (
            <button
              onClick={handleStartPipeline}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{sourceType.startsWith('webcam') ? 'Start Webcam AI' : 'Start Stream'}</span>
            </button>
          )}

          {/* Camera Setup Guide Toggle */}
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-xs text-gray-300 border border-industrial-700 transition-colors"
          >
            <Compass className="w-3.5 h-3.5 text-safety-cyan" />
            <span>Camera Guide</span>
          </button>

          <a
            href="/api/cctv/snapshot"
            target="_blank"
            download="cctv_snapshot.jpg"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-xs text-gray-300 border border-industrial-700 transition-colors"
          >
            <Camera className="w-3.5 h-3.5 text-safety-cyan" />
            <span>Snapshot</span>
          </a>
        </div>
      </div>

      {/* Camera Setup & Calibration Guide Modal */}
      {showGuide && (
        <div className="glass-panel p-6 rounded-2xl border border-safety-cyan/30 space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between border-b border-industrial-800 pb-3">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-safety-cyan" />
              <h3 className="font-bold text-white text-base">Laptop Webcam Setup & Performance Guide</h3>
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-industrial-800"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-xl bg-industrial-950 border border-industrial-800 space-y-1.5">
              <span className="font-bold text-safety-cyan block text-sm">1. Low Latency & High FPS</span>
              <p className="text-gray-300 leading-relaxed">
                Native HTML5 video element streams live at 30 FPS. AI inference runs asynchronously in the background dropping stale frames.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-industrial-950 border border-industrial-800 space-y-1.5">
              <span className="font-bold text-emerald-400 block text-sm">2. Lighting & Distance</span>
              <p className="text-gray-300 leading-relaxed">
                Position yourself 1 to 3 meters from camera in good lighting. Ensure head, torso, and hands are visible for complete PPE checks.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-industrial-950 border border-industrial-800 space-y-1.5">
              <span className="font-bold text-amber-400 block text-sm">3. Multi-Category Verification</span>
              <p className="text-gray-300 leading-relaxed">
                Checks Helmet, Vest, Gloves, Goggles, Mask, and Boots. Statuses return PASS, FAIL, UNKNOWN, or NOT VISIBLE.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 pt-2 border-t border-industrial-900">
            <span>ACTIVE HARDWARE: {cameraSettings.label} ({cameraSettings.width}x{cameraSettings.height} @ {cameraSettings.frameRate} FPS)</span>
            <span>MODEL REGISTRY: YOLOv8 Multiclass Worker & PPE Engine</span>
          </div>
        </div>
      )}

      {/* Main CCTV Feed + Telemetry HUD */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Stream Viewport (3 Columns) */}
        <div className="xl:col-span-3 glass-panel p-4 rounded-2xl flex flex-col space-y-4">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center border border-industrial-700 shadow-2xl">
            {cameraError ? (
              <div className="text-center p-8 max-w-md space-y-4">
                <ShieldAlert className="w-12 h-12 text-red-500 mx-auto animate-bounce" />
                <div className="text-base font-bold text-white">Camera Access Error</div>
                <p className="text-xs text-red-300 font-mono bg-red-950/80 p-3 rounded-lg border border-red-800">
                  {cameraError}
                </p>
                <button
                  onClick={() => startWebcam()}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-semibold transition-all"
                >
                  Retry Camera Permission
                </button>
              </div>
            ) : sourceType.startsWith('webcam') ? (
              <div className="relative w-full h-full flex items-center justify-center">
                {/* Native 30 FPS Live Video Stream */}
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
                    viewMode === 'overlay' && isWebcamActive ? 'block' : 'hidden'
                  }`}
                />

                {/* Alternative Annotated Image View Mode */}
                {viewMode === 'annotated' && annotatedFrameUrl && (
                  <img
                    src={annotatedFrameUrl}
                    alt="Live Laptop Webcam Annotated Stream"
                    className="absolute inset-0 w-full h-full object-contain rounded-xl"
                  />
                )}

                {!isWebcamActive && (
                  <div className="text-center p-8 space-y-3">
                    <RefreshCw className="w-8 h-8 text-safety-cyan mx-auto animate-spin" />
                    <div className="text-sm font-semibold text-white">
                      Click "Start Webcam AI" to enable Laptop Camera
                    </div>
                  </div>
                )}
              </div>
            ) : streamError ? (
              <div className="text-center p-8 space-y-3">
                <ShieldAlert className="w-12 h-12 text-amber-500 mx-auto" />
                <div className="text-sm font-semibold text-white">Stream Initializing or Source Idle</div>
                <button
                  onClick={() => {
                    setStreamError(false);
                    handleStartPipeline();
                  }}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white"
                >
                  Reconnect Stream
                </button>
              </div>
            ) : (
              <img
                src="/api/cctv/stream"
                alt="CCTV Video Feed"
                className="w-full h-full object-contain"
                onError={() => setStreamError(true)}
              />
            )}

            {/* In-feed Camera HUD Overlay */}
            <div className="absolute top-4 left-4 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white font-mono text-xs flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-red-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
                {sourceType.startsWith('webcam') ? 'LAPTOP-WEBCAM-01' : 'CAM-01'}
              </span>
              <span className="text-gray-400">|</span>
              <span className="text-gray-300">
                {sourceType.startsWith('webcam') ? 'LOCAL-INPUT' : 'WAREHOUSE-SECTOR-A'}
              </span>
              <span className="text-gray-400">|</span>
              <span className="text-safety-cyan font-bold flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {status?.fps ? `${status.fps.toFixed(1)} FPS` : '-- FPS'}
              </span>
            </div>

            <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white font-mono text-[11px] flex items-center gap-4">
              <span>ACTIVE TRACKS: <strong className="text-cyan-400">{status?.active_workers_count || 0}</strong></span>
              <span>CUMULATIVE: <strong className="text-white">{status?.total_unique_tracks || 0}</strong></span>
              <span>VIOLATIONS: <strong className="text-red-400">{status?.violations_count || 0}</strong></span>
            </div>
          </div>

          {/* Stream Telemetry Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-industrial-950 border border-industrial-800">
              <span className="text-gray-400 block text-[10px]">INFERENCE FPS</span>
              <span className="text-base font-bold text-white">{status?.fps?.toFixed(1) || '0.0'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-industrial-950 border border-industrial-800">
              <span className="text-gray-400 block text-[10px]">FRAME INDEX</span>
              <span className="text-base font-bold text-white">#{status?.frame_index || 0}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-industrial-950 border border-industrial-800">
              <span className="text-gray-400 block text-[10px]">LATENCY</span>
              <span className="text-base font-bold text-cyan-400">{latencyMs ? `${latencyMs} ms` : '--'}</span>
            </div>
            <div className="p-2.5 rounded-lg bg-industrial-950 border border-industrial-800">
              <span className="text-gray-400 block text-[10px]">ENVIRONMENT HAZARD</span>
              <span className={`text-base font-bold ${status?.weather_risk === 'SAFE' ? 'text-emerald-400' : 'text-amber-400'}`}>
                {status?.weather_risk || 'SAFE'}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-industrial-950 border border-industrial-800">
              <span className="text-gray-400 block text-[10px]">ACTIVE VIOLATIONS</span>
              <span className="text-base font-bold text-red-400">{status?.violations_count || 0}</span>
            </div>
          </div>
        </div>

        {/* Live Detected Personnel Sidebar (1 Column) */}
        <div className="glass-panel p-5 rounded-2xl flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-industrial-800 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-safety-cyan" />
              <h3 className="font-semibold text-white text-sm">Detected Personnel</h3>
            </div>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800">
              {detections.length} In-Frame
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 max-h-[620px] pr-1">
            {detections.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-xs font-mono">
                No workers currently detected in active video feed.
              </div>
            ) : (
              detections.map((w: any) => (
                <div
                  key={w.track_id}
                  className="p-3.5 rounded-xl bg-industrial-950 border border-industrial-800 space-y-2.5"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-1.5">
                        {w.worker_name && w.worker_name !== 'UNKNOWN' ? w.worker_name : `Person #${w.track_id}`}
                        {w.is_verified && (
                          <span className="text-[10px] text-emerald-400 bg-emerald-950/80 px-1 py-0.2 rounded border border-emerald-800 font-mono">
                            VERIFIED
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-gray-400 mt-0.5">
                        ID: <span className="text-gray-200">{w.worker_id || 'UNENROLLED'}</span> | Track #{w.track_id}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${getStatusColor(
                        w.safety_status
                      )}`}
                    >
                      {w.safety_status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-gray-400 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Compass className="w-3.5 h-3.5 text-gray-400" />
                      <span>Zone:</span>
                      <strong className="text-white">{w.zone_name || 'General Area'}</strong>
                    </div>
                    <span className="text-gray-500">Conf: {w.confidence ? `${(w.confidence * 100).toFixed(0)}%` : '--'}</span>
                  </div>

                  {/* 6 Individual PPE Compliance Grid */}
                  <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-industrial-900">
                    {renderPPEBadge('HELMET', w.helmet_status)}
                    {renderPPEBadge('VEST', w.vest_status)}
                    {renderPPEBadge('GLOVES', w.gloves_status)}
                    {renderPPEBadge('GOGGLES', w.goggles_status || 'UNKNOWN')}
                    {renderPPEBadge('MASK', w.mask_status || 'UNKNOWN')}
                    {renderPPEBadge('BOOTS', w.boots_status || 'UNKNOWN')}
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
