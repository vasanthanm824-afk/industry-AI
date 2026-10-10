'use client';

import React, { useEffect, useState } from 'react';
import {
  CloudSun,
  Wind,
  Droplets,
  Thermometer,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Compass,
  MapPin,
  Search,
  AlertTriangle,
  Clock,
  Eye,
  Zap,
  Info,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { apiFetch } from '@/lib/api';

export default function WeatherPage() {
  const [weather, setWeather] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'prompt' | 'granted' | 'denied' | 'locating' | 'error'>('prompt');
  const [locationError, setLocationError] = useState<string | null>(null);

  // Active Coordinates & City
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [citySearchQuery, setCitySearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingCities, setSearchingCities] = useState<boolean>(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);

  // Fetch weather for specific lat/lon or default
  const fetchWeather = async (lat?: number, lon?: number, locName?: string, isRefresh: boolean = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      let endpoint = '/weather?';
      const params: string[] = [];
      if (lat !== undefined && lon !== undefined) {
        params.push(`lat=${lat}&lon=${lon}`);
      }
      if (locName) {
        params.push(`location_name=${encodeURIComponent(locName)}`);
      }
      if (isRefresh) {
        params.push('refresh=true');
      }

      endpoint += params.join('&');
      const res = await apiFetch(endpoint);
      setWeather(res);
    } catch (e: any) {
      console.error('Failed to fetch weather telemetry:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Browser Geolocation Detection
  const requestCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationStatus('error');
      setLocationError('Geolocation is not supported by your browser or environment.');
      fetchWeather();
      return;
    }

    setLocationStatus('locating');
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        setCoords({ lat: latitude, lon: longitude });
        setLocationStatus('granted');
        setLocationError(null);
        fetchWeather(latitude, longitude, undefined, true);
      },
      (error) => {
        console.warn('Geolocation permission or retrieval error:', error);
        setLocationStatus('denied');
        if (error.code === error.PERMISSION_DENIED) {
          setLocationError('Location access was denied. You can manually search for any city below.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setLocationError('Location position unavailable. Please search your city manually.');
        } else if (error.code === error.TIMEOUT) {
          setLocationError('Location detection timed out. Please try again or search manually.');
        } else {
          setLocationError(`Location error: ${error.message}`);
        }
        fetchWeather();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Search cities via backend proxy
  const handleCitySearchInput = async (query: string) => {
    setCitySearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    setSearchingCities(true);
    try {
      const res = await apiFetch(`/weather/search?q=${encodeURIComponent(query.trim())}`);
      setSearchResults(res.results || []);
      setShowSearchDropdown(true);
    } catch (e) {
      console.error('City search failed:', e);
    } finally {
      setSearchingCities(false);
    }
  };

  const selectCity = (city: any) => {
    setCoords({ lat: city.latitude, lon: city.longitude });
    setCitySearchQuery(city.label);
    setShowSearchDropdown(false);
    fetchWeather(city.latitude, city.longitude, city.label, true);
  };

  useEffect(() => {
    // Attempt location request on mount
    requestCurrentLocation();
    // Auto-refresh weather every 10 minutes (600,000 ms)
    const interval = setInterval(() => {
      fetchWeather(coords?.lat, coords?.lon, undefined, false);
    }, 600000);
    return () => clearInterval(interval);
  }, []);

  const isSafe = weather?.risk_level === 'SAFE';
  const isCaution = weather?.risk_level === 'CAUTION';
  const isHighRisk = weather?.risk_level === 'HIGH_RISK';

  const formatTimestamp = (ts?: string) => {
    if (!ts) return '--:--';
    try {
      return new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return ts;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Banner */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CloudSun className="w-6 h-6 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-wide">Real-Time Weather Station</h2>
            {weather?.is_stale && (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-400">
                STALE DATA / OFFLINE
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 font-mono">
            Live atmospheric measurements from Open-Meteo API correlated with OSHA/ISO outdoor safety thresholds.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Manual City Search Bar */}
          <div className="relative flex-1 sm:w-64">
            <div className="flex items-center gap-2 bg-industrial-950 border border-industrial-800 rounded-lg px-3 py-1.5 text-xs text-white">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                value={citySearchQuery}
                onChange={(e) => handleCitySearchInput(e.target.value)}
                placeholder="Search city or location..."
                className="bg-transparent text-white focus:outline-none w-full"
              />
              {searchingCities && <RefreshCw className="w-3 h-3 text-safety-cyan animate-spin" />}
            </div>

            {/* City Search Results Dropdown */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-industrial-950 border border-industrial-800 rounded-xl shadow-2xl z-50 overflow-hidden text-xs">
                {searchResults.map((city, idx) => (
                  <button
                    key={idx}
                    onClick={() => selectCity(city)}
                    className="w-full text-left px-3.5 py-2 hover:bg-industrial-800 text-gray-200 flex items-center gap-2 transition-colors border-b border-industrial-900/60 last:border-0"
                  >
                    <MapPin className="w-3.5 h-3.5 text-safety-cyan" />
                    <span>{city.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Current Location Button */}
          <button
            onClick={requestCurrentLocation}
            disabled={locationStatus === 'locating'}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-industrial-800 hover:bg-industrial-700 text-xs font-semibold text-white border border-industrial-700 transition-colors cursor-pointer"
          >
            <MapPin className={`w-3.5 h-3.5 text-safety-cyan ${locationStatus === 'locating' ? 'animate-bounce' : ''}`} />
            <span>{locationStatus === 'locating' ? 'Detecting Location...' : 'Use My Location'}</span>
          </button>

          {/* Refresh Weather Button */}
          <button
            onClick={() => fetchWeather(coords?.lat, coords?.lon, undefined, true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{refreshing ? 'Fetching API...' : 'Refresh Weather'}</span>
          </button>
        </div>
      </div>

      {/* Geolocation Permission or Location Status Warning Banner */}
      {locationError && (
        <div className="p-4 rounded-xl bg-amber-950/70 border border-amber-800 text-amber-200 text-xs font-mono flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{locationError}</span>
          </div>
          <button
            onClick={requestCurrentLocation}
            className="px-2.5 py-1 rounded bg-amber-900 hover:bg-amber-800 text-white text-[11px] font-bold"
          >
            Retry Permission
          </button>
        </div>
      )}

      {/* Primary Atmospheric Hazard Assessment Banner */}
      <div
        className={`p-6 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl ${
          isSafe
            ? 'bg-emerald-950/40 border-emerald-800/80'
            : isCaution
            ? 'bg-amber-950/40 border-amber-800/80'
            : isHighRisk
            ? 'bg-red-950/50 border-red-800/90'
            : 'bg-industrial-900 border-industrial-700'
        }`}
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <span
              className={`px-2.5 py-0.5 rounded-full font-bold border ${
                isSafe
                  ? 'bg-emerald-900/80 text-emerald-300 border-emerald-700'
                  : isCaution
                  ? 'bg-amber-900/80 text-amber-300 border-amber-700'
                  : 'bg-red-900/80 text-red-300 border-red-700 animate-pulse'
              }`}
            >
              LEVEL: {weather?.risk_level || 'ANALYZING'}
            </span>
            <span className="text-gray-300 font-bold flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-safety-cyan" />
              {weather?.location_name || 'Detecting Location...'}
            </span>
            {weather?.latitude != null && weather?.longitude != null && (
              <span className="text-gray-400 font-mono text-[11px]">
                ({weather.latitude}° N, {weather.longitude}° W)
              </span>
            )}
          </div>

          <h3 className="text-2xl font-bold text-white">
            {isSafe
              ? 'Atmospheric Conditions Favorable for Outdoor Industrial Work'
              : isCaution
              ? 'Weather Advisory: Enhanced High-Vis & Anti-Slip Precautions Required'
              : isHighRisk
              ? 'Hazard Advisory: Severe Atmospheric Conditions Halt Outdoor Tasks'
              : 'Environmental Telemetry Querying...'}
          </h3>

          <p className="text-xs text-gray-300 leading-relaxed">
            {isSafe
              ? 'Wind speeds, precipitation rates, and thermal indices are within safe operating limits.'
              : isCaution
              ? 'Gale winds, low visibility, or rain detected. Require hardhat chinstraps and wet-weather PPE.'
              : 'Extreme weather limits crane lifts and elevated scaffolding tasks. Automatic safety advisories dispatched.'}
          </p>

          <div className="flex items-center gap-4 text-[11px] font-mono text-gray-400 pt-1">
            <span>SOURCE: {weather?.source || 'Open-Meteo Real-Time Weather API'}</span>
            <span>LAST UPDATED: {formatTimestamp(weather?.timestamp)}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0 space-y-1">
          <div className="text-5xl font-bold text-white font-mono tracking-tight">
            {weather?.temperature_c != null ? `${weather.temperature_c}°C` : '--°C'}
          </div>
          <div className="text-sm font-semibold text-safety-cyan">{weather?.condition || 'Analyzing...'}</div>
          {weather?.apparent_temperature_c != null && (
            <div className="text-xs font-mono text-gray-400">
              Feels like <strong className="text-white">{weather.apparent_temperature_c}°C</strong>
            </div>
          )}
        </div>
      </div>

      {/* 6 Detailed Atmospheric Sensor Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* 1. Ambient Temperature */}
        <div className="glass-card p-5 rounded-2xl border border-industrial-700/60 space-y-3">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono uppercase">Ambient Temperature</span>
            <Thermometer className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-white">
              {weather?.temperature_c != null ? `${weather.temperature_c}°C` : 'N/A'}
            </span>
            {weather?.apparent_temperature_c != null && (
              <span className="text-xs font-mono text-gray-400">Feels {weather.apparent_temperature_c}°C</span>
            )}
          </div>
          <div className="text-xs text-gray-400 font-mono">
            Thermal Enclosure:{' '}
            <strong className="text-emerald-400">Normal Comfort Range (10°C - 33°C)</strong>
          </div>
        </div>

        {/* 2. Surface Wind Velocity */}
        <div className="glass-card p-5 rounded-2xl border border-industrial-700/60 space-y-3">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono uppercase">Surface Wind Velocity</span>
            <Wind className="w-5 h-5 text-safety-cyan" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-white">
              {weather?.wind_speed_kmh != null ? `${weather.wind_speed_kmh} km/h` : 'N/A'}
            </span>
            {weather?.wind_direction_compass && (
              <span className="text-xs font-mono text-cyan-400 font-bold bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800">
                {weather.wind_direction_compass} ({weather.wind_direction_deg}°)
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 font-mono">
            Crane Operation Limit: <strong className="text-gray-300">Max 50.0 km/h</strong>
          </div>
        </div>

        {/* 3. Relative Humidity */}
        <div className="glass-card p-5 rounded-2xl border border-industrial-700/60 space-y-3">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono uppercase">Relative Humidity</span>
            <Droplets className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">
            {weather?.humidity_pct != null ? `${weather.humidity_pct}%` : 'N/A'}
          </div>
          <div className="text-xs text-gray-400 font-mono">
            Moisture Envelope: <strong className="text-emerald-400">Moderate Moisture Level</strong>
          </div>
        </div>

        {/* 4. Precipitation Rate */}
        <div className="glass-card p-5 rounded-2xl border border-industrial-700/60 space-y-3">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono uppercase">Precipitation Rate</span>
            <CloudSun className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">
            {weather?.rain_mm != null ? `${weather.rain_mm} mm/h` : '0.0 mm/h'}
          </div>
          <div className="text-xs text-gray-400 font-mono">
            Ground Friction Index:{' '}
            <strong className={weather?.rain_mm > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {weather?.rain_mm > 0 ? 'Wet Surfaces / Slip Caution' : 'Dry / Normal Friction'}
            </strong>
          </div>
        </div>

        {/* 5. Cloud Cover */}
        <div className="glass-card p-5 rounded-2xl border border-industrial-700/60 space-y-3">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono uppercase">Cloud Cover Density</span>
            <Eye className="w-5 h-5 text-purple-400" />
          </div>
          <div className="text-3xl font-bold font-mono text-white">
            {weather?.cloud_cover_pct != null ? `${weather.cloud_cover_pct}%` : 'N/A'}
          </div>
          <div className="text-xs text-gray-400 font-mono">
            Direct Solar Radiation: <strong className="text-gray-300">{weather?.cloud_cover_pct > 80 ? 'Low Solar Exposure' : 'Normal UV Load'}</strong>
          </div>
        </div>

        {/* 6. Condition Code */}
        <div className="glass-card p-5 rounded-2xl border border-industrial-700/60 space-y-3">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-mono uppercase">WMO Weather Condition</span>
            <Compass className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-white truncate">
            {weather?.condition || 'Analyzing...'}
          </div>
          <div className="text-xs text-gray-400 font-mono">
            WMO Code: <strong className="text-safety-cyan">Code #{weather?.weather_code ?? 0}</strong>
          </div>
        </div>
      </div>

      {/* Industrial Weather Risk Assessment Matrix */}
      <div className="glass-panel p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-industrial-800 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-safety-cyan" />
            <h3 className="font-bold text-white text-base">Industrial Workplace Weather Risk Assessment</h3>
          </div>
          <span className="text-xs font-mono text-gray-400">Derived from API Measurements vs Workplace Policies</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-industrial-800 text-gray-400 uppercase">
                <th className="py-2.5 px-3">Hazard Category</th>
                <th className="py-2.5 px-3">API Reading</th>
                <th className="py-2.5 px-3">Configured Threshold</th>
                <th className="py-2.5 px-3">Risk Level</th>
                <th className="py-2.5 px-3">Recommended Precaution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-industrial-900/60">
              {weather?.risk_indicators && weather.risk_indicators.length > 0 ? (
                weather.risk_indicators.map((risk: any, idx: number) => (
                  <tr key={idx} className="hover:bg-industrial-900/40 transition-colors">
                    <td className="py-3 px-3 font-bold text-white flex items-center gap-2">
                      <Zap className="w-3.5 h-3.5 text-safety-cyan" />
                      {risk.category}
                    </td>
                    <td className="py-3 px-3 text-cyan-300 font-bold">{risk.measurement}</td>
                    <td className="py-3 px-3 text-gray-400">{risk.threshold}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          risk.level === 'SAFE'
                            ? 'bg-emerald-950/80 border-emerald-800 text-emerald-400'
                            : risk.level === 'CAUTION'
                            ? 'bg-amber-950/80 border-amber-800 text-amber-400'
                            : 'bg-red-950/80 border-red-800 text-red-400 animate-pulse'
                        }`}
                      >
                        {risk.level}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-gray-300 leading-relaxed max-w-xs">{risk.precaution}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    Querying real-time weather risk indicators...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 24-Hour Hourly Forecast Strip */}
      {weather?.hourly_forecast && weather.hourly_forecast.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-industrial-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-safety-cyan" />
              <h3 className="font-bold text-white text-base">24-Hour Meteorological Forecast</h3>
            </div>
            <span className="text-xs font-mono text-gray-400">Hourly Atmospheric Trend</span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 pr-1 font-mono text-xs scrollbar-thin">
            {weather.hourly_forecast.map((h: any, idx: number) => {
              const hourLabel = new Date(h.time).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
              return (
                <div
                  key={idx}
                  className="flex-shrink-0 w-28 p-3 rounded-xl bg-industrial-950 border border-industrial-800 text-center space-y-2"
                >
                  <span className="text-[11px] font-bold text-gray-300 block">{hourLabel}</span>
                  <div className="text-lg font-bold text-white">{h.temperature_c}°C</div>
                  <span className="text-[10px] text-safety-cyan block truncate">{h.condition}</span>
                  <div className="text-[10px] text-gray-400 pt-1 border-t border-industrial-900 space-y-0.5">
                    <div>Rain: {h.precip_probability_pct}%</div>
                    <div>Wind: {h.wind_speed_kmh}km/h</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 7-Day Daily Forecast Cards */}
      {weather?.daily_forecast && weather.daily_forecast.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-industrial-800 pb-3">
            <div className="flex items-center gap-2">
              <CloudSun className="w-5 h-5 text-safety-cyan" />
              <h3 className="font-bold text-white text-base">7-Day Meteorological Forecast</h3>
            </div>
            <span className="text-xs font-mono text-gray-400">Extended Outlook</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 font-mono text-xs">
            {weather.daily_forecast.map((d: any, idx: number) => {
              const dayName = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-industrial-950 border border-industrial-800 text-center space-y-2"
                >
                  <span className="font-bold text-gray-200 block text-xs">{dayName}</span>
                  <div className="text-sm font-bold text-white">
                    {d.temp_max_c}° / <span className="text-gray-400">{d.temp_min_c}°</span>
                  </div>
                  <span className="text-[10px] text-safety-cyan block truncate">{d.condition}</span>
                  {d.precip_sum_mm > 0 && (
                    <span className="text-[10px] text-blue-400 block font-bold">
                      {d.precip_sum_mm} mm
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
