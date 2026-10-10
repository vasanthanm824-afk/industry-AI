"""
Weather Monitoring & Environmental Safety Risk Service
Fetches real atmospheric measurements (temperature, humidity, wind, precipitation, cloud cover)
and calculates industrial safety hazards using real-time geolocation and Open-Meteo APIs.
Gracefully handles offline states and stale cache indicators.
"""

from datetime import datetime
import json
import os
import time
from typing import Dict, List, Optional, Tuple
import requests
from sqlalchemy.orm import Session

from backend.db.models.weather_record import WeatherRecord
from backend.db.session import SessionLocal, init_db

# Default industrial site coordinates
DEFAULT_LATITUDE = float(os.environ.get("SITE_LATITUDE", "37.7749"))
DEFAULT_LONGITUDE = float(os.environ.get("SITE_LONGITUDE", "-122.4194"))
DEFAULT_SITE_NAME = os.environ.get("SITE_NAME", "Industrial Facility Alpha (San Francisco, CA)")

# WMO Weather interpretation codes
WMO_CODE_MAP = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}


def deg_to_compass(deg: float) -> str:
    """Convert wind direction degrees to 8-point cardinal compass string."""
    val = int((deg / 45.0) + 0.5)
    arr = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    return arr[val % 8]


class WeatherService:
    def __init__(self, db_session: Optional[Session] = None):
        init_db()
        self._external_session = db_session
        self._cache: Dict[str, Tuple[float, Dict[str, any]]] = {}
        self._cache_ttl_seconds: float = 300.0  # 5 minutes TTL

    def _get_session(self) -> Session:
        return self._external_session if self._external_session is not None else SessionLocal()

    def search_cities(self, query: str) -> List[Dict[str, any]]:
        """
        Search cities by name using Open-Meteo Geocoding API.
        """
        if not query or len(query.strip()) < 2:
            return []

        try:
            url = f"https://geocoding-api.open-meteo.com/v1/search?name={requests.utils.quote(query.strip())}&count=5&language=en&format=json"
            resp = requests.get(url, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results", [])
                out = []
                for item in results:
                    name = item.get("name", "")
                    admin1 = item.get("admin1", "")
                    country = item.get("country", "")
                    label_parts = [p for p in [name, admin1, country] if p]
                    label = ", ".join(label_parts)
                    out.append({
                        "name": name,
                        "label": label,
                        "latitude": float(item.get("latitude")),
                        "longitude": float(item.get("longitude")),
                        "country": country,
                        "admin1": admin1,
                    })
                return out
        except Exception as e:
            print(f"[WeatherService] City geocoding search failed: {e}")
        return []

    def reverse_geocode(self, lat: float, lon: float) -> str:
        """
        Reverse geocode latitude and longitude to a human-readable city/locality name.
        """
        try:
            url = f"https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={lat}&longitude={lon}&localityLanguage=en"
            resp = requests.get(url, timeout=4)
            if resp.status_code == 200:
                data = resp.json()
                city = data.get("city") or data.get("locality") or data.get("principalSubdivision")
                country = data.get("countryName") or data.get("countryCode")
                state = data.get("principalSubdivision")
                parts = [p for p in [city, state, country] if p]
                if parts:
                    return ", ".join(parts)
        except Exception as e:
            print(f"[WeatherService] Reverse geocode failed: {e}")

        return f"Location ({lat:.4f}, {lon:.4f})"

    def get_current_weather(
        self,
        lat: Optional[float] = None,
        lon: Optional[float] = None,
        location_name: Optional[str] = None,
        force_refresh: bool = False,
    ) -> Dict[str, any]:
        """
        Retrieves real atmospheric weather data from Open-Meteo API for given lat/lon.
        Defaults to site coordinates if not provided.
        """
        use_lat = lat if lat is not None else DEFAULT_LATITUDE
        use_lon = lon if lon is not None else DEFAULT_LONGITUDE

        cache_key = f"{use_lat:.3f}_{use_lon:.3f}"
        now = time.time()

        if not force_refresh and cache_key in self._cache:
            cache_time, cached_data = self._cache[cache_key]
            if (now - cache_time) < self._cache_ttl_seconds:
                return cached_data

        try:
            reading = self._fetch_open_meteo_weather(use_lat, use_lon, location_name)
            self._cache[cache_key] = (now, reading)
            if reading.get("risk_level") != "WEATHER_UNAVAILABLE":
                self._save_record(reading)
            return reading
        except Exception as e:
            print(f"[WeatherService] Live weather fetch error: {e}")
            # If fetch fails, return cached reading if available, marked as stale
            if cache_key in self._cache:
                _, cached_data = self._cache[cache_key]
                cached_copy = dict(cached_data)
                cached_copy["is_stale"] = True
                cached_copy["source"] += " (Stale Offline Cache)"
                return cached_copy

        return self._build_unavailable_response(use_lat, use_lon, location_name)

    def _fetch_open_meteo_weather(self, lat: float, lon: float, location_name: Optional[str]) -> Dict[str, any]:
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}"
            f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m"
            f"&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m"
            f"&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum"
            f"&timezone=auto"
        )
        resp = requests.get(url, timeout=7)
        if resp.status_code != 200:
            raise RuntimeError(f"Open-Meteo returned status {resp.status_code}")

        data = resp.json()
        current = data.get("current", {})

        temp = float(current.get("temperature_2m", 0.0))
        apparent_temp = float(current.get("apparent_temperature", temp))
        humidity = float(current.get("relative_humidity_2m", 0.0))
        precip = float(current.get("precipitation", 0.0))
        wcode = int(current.get("weather_code", 0))
        cloud_cover = float(current.get("cloud_cover", 0.0))
        wind_speed = float(current.get("wind_speed_10m", 0.0))
        wind_dir = float(current.get("wind_direction_10m", 0.0))

        condition = WMO_CODE_MAP.get(wcode, "Partly cloudy")
        wind_compass = deg_to_compass(wind_dir)

        # Resolve location name if not provided
        resolved_name = location_name if location_name else self.reverse_geocode(lat, lon)

        # Compute industrial weather risk indicators
        overall_risk, risk_indicators = self._compute_industrial_weather_risks(
            temp=temp,
            wind_speed=wind_speed,
            precip=precip,
            humidity=humidity,
            cloud_cover=cloud_cover,
            weather_code=wcode,
            condition=condition,
        )

        # Build 24-hour hourly forecast
        hourly = data.get("hourly", {})
        hourly_forecast = []
        if "time" in hourly:
            times = hourly.get("time", [])[:24]
            temps = hourly.get("temperature_2m", [])[:24]
            humi = hourly.get("relative_humidity_2m", [])[:24]
            probs = hourly.get("precipitation_probability", [])[:24]
            codes = hourly.get("weather_code", [])[:24]
            winds = hourly.get("wind_speed_10m", [])[:24]

            for i in range(len(times)):
                h_code = int(codes[i]) if i < len(codes) else 0
                hourly_forecast.append({
                    "time": times[i],
                    "temperature_c": round(float(temps[i]), 1) if i < len(temps) else temp,
                    "humidity_pct": int(humi[i]) if i < len(humi) else int(humidity),
                    "precip_probability_pct": int(probs[i]) if i < len(probs) else 0,
                    "condition": WMO_CODE_MAP.get(h_code, "Clear"),
                    "weather_code": h_code,
                    "wind_speed_kmh": round(float(winds[i]), 1) if i < len(winds) else wind_speed,
                })

        # Build 7-day daily forecast
        daily = data.get("daily", {})
        daily_forecast = []
        if "time" in daily:
            d_times = daily.get("time", [])
            d_codes = daily.get("weather_code", [])
            d_max = daily.get("temperature_2m_max", [])
            d_min = daily.get("temperature_2m_min", [])
            d_precip = daily.get("precipitation_sum", [])

            for i in range(len(d_times)):
                d_code = int(d_codes[i]) if i < len(d_codes) else 0
                daily_forecast.append({
                    "date": d_times[i],
                    "weather_code": d_code,
                    "condition": WMO_CODE_MAP.get(d_code, "Clear"),
                    "temp_max_c": round(float(d_max[i]), 1) if i < len(d_max) else temp,
                    "temp_min_c": round(float(d_min[i]), 1) if i < len(d_min) else temp,
                    "precip_sum_mm": round(float(d_precip[i]), 1) if i < len(d_precip) else 0.0,
                })

        now_iso = datetime.utcnow().isoformat()

        return {
            "temperature_c": round(temp, 1),
            "apparent_temperature_c": round(apparent_temp, 1),
            "humidity_pct": round(humidity, 1),
            "condition": condition,
            "weather_code": wcode,
            "rain_mm": round(precip, 1),
            "wind_speed_kmh": round(wind_speed, 1),
            "wind_direction_deg": round(wind_dir, 1),
            "wind_direction_compass": wind_compass,
            "cloud_cover_pct": round(cloud_cover, 1),
            "risk_level": overall_risk,
            "risk_indicators": risk_indicators,
            "location_name": resolved_name,
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "hourly_forecast": hourly_forecast,
            "daily_forecast": daily_forecast,
            "source": f"Open-Meteo Real-Time Weather API ({resolved_name})",
            "timestamp": now_iso,
            "is_stale": False,
        }

    def _compute_industrial_weather_risks(
        self,
        temp: float,
        wind_speed: float,
        precip: float,
        humidity: float,
        cloud_cover: float,
        weather_code: int,
        condition: str,
    ) -> Tuple[str, List[Dict[str, any]]]:
        """
        Computes structured industrial weather risk assessments for outdoor worker safety.
        Distinguishes actual API measurements from derived risk indicators.
        """
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        indicators = []

        # 1. Surface Wind Velocity Risk
        if wind_speed >= 50.0:
            wind_level = "HIGH_RISK"
            wind_precaution = "Halt all crane operations, elevated platform work, and scaffolding. Secure loose site materials."
        elif wind_speed >= 35.0:
            wind_level = "CAUTION"
            wind_precaution = "Require hardhat chinstraps. Exercise caution during crane lifts and high-elevation tasks."
        else:
            wind_level = "SAFE"
            wind_precaution = "Normal wind velocities. Standard outdoor work authorized."

        indicators.append({
            "category": "Surface Wind Velocity",
            "measurement": f"{wind_speed:.1f} km/h",
            "threshold": "35.0 km/h (Caution) / 50.0 km/h (High Risk)",
            "level": wind_level,
            "precaution": wind_precaution,
            "updated_time": now_str,
        })

        # 2. Precipitation & Ground Friction Risk
        if precip >= 15.0 or weather_code in (65, 67, 82):
            rain_level = "HIGH_RISK"
            rain_precaution = "Heavy rainfall. Beware of excavation trench flooding and severe slip hazards. Suspend outdoor electrical tasks."
        elif precip >= 4.0 or weather_code in (61, 63, 80, 81):
            rain_level = "CAUTION"
            rain_precaution = "Wet conditions detected. Require slip-resistant safety boots and high-visibility rain gear."
        else:
            rain_level = "SAFE"
            rain_precaution = "Ground surfaces dry. Normal outdoor movement authorized."

        indicators.append({
            "category": "Precipitation & Ground Friction",
            "measurement": f"{precip:.1f} mm/h",
            "threshold": "4.0 mm/h (Caution) / 15.0 mm/h (High Risk)",
            "level": rain_level,
            "precaution": rain_precaution,
            "updated_time": now_str,
        })

        # 3. Thermal Stress (Heat / Cold)
        if temp >= 38.0:
            temp_level = "HIGH_RISK"
            temp_precaution = "Extreme Heat Warning (>38°C). Enforce mandatory 15-min shade hydration breaks every hour."
        elif temp >= 34.0 or temp <= 0.0:
            temp_level = "CAUTION"
            temp_precaution = "Thermal Stress Advisory. Monitor workers for heat exhaustion or cold exposure signs."
        else:
            temp_level = "SAFE"
            temp_precaution = "Ambient temperature within safe thermal comfort range (10°C - 33°C)."

        indicators.append({
            "category": "Thermal Stress Index",
            "measurement": f"{temp:.1f}°C",
            "threshold": "<0°C or >34°C (Caution) / >38°C (High Risk)",
            "level": temp_level,
            "precaution": temp_precaution,
            "updated_time": now_str,
        })

        # 4. Convective Storm & Lightning Advisory
        if weather_code in (95, 96, 99) or "thunderstorm" in condition.lower():
            storm_level = "HIGH_RISK"
            storm_precaution = "LIGHTNING / THUNDERSTORM ADVISORY. Evacuate open fields and tall metal structures immediately."
        else:
            storm_level = "SAFE"
            storm_precaution = "No convective thunderstorm activity detected."

        indicators.append({
            "category": "Convective Storm & Lightning",
            "measurement": condition,
            "threshold": "WMO Severe Convective Codes (95-99)",
            "level": storm_level,
            "precaution": storm_precaution,
            "updated_time": now_str,
        })

        # 5. Visibility & Cloud Cover Risk
        if weather_code in (45, 48) or cloud_cover >= 95.0:
            vis_level = "CAUTION"
            vis_precaution = "Reduced atmospheric visibility or heavy fog. Ensure vehicle headlights and high-visibility vests are active."
        else:
            vis_level = "SAFE"
            vis_precaution = "Clear atmospheric visibility."

        indicators.append({
            "category": "Atmospheric Visibility",
            "measurement": f"{cloud_cover:.0f}% Cloud Cover ({condition})",
            "threshold": "Dense Fog (WMO 45/48) or >95% Overcast",
            "level": vis_level,
            "precaution": vis_precaution,
            "updated_time": now_str,
        })

        # Overall Risk Level computation
        levels = [ind["level"] for ind in indicators]
        if "HIGH_RISK" in levels:
            overall_risk = "HIGH_RISK"
        elif "CAUTION" in levels:
            overall_risk = "CAUTION"
        else:
            overall_risk = "SAFE"

        return overall_risk, indicators

    def _build_unavailable_response(self, lat: float, lon: float, location_name: Optional[str]) -> Dict[str, any]:
        now_iso = datetime.utcnow().isoformat()
        resolved_name = location_name or f"Location ({lat:.4f}, {lon:.4f})"

        return {
            "temperature_c": None,
            "apparent_temperature_c": None,
            "humidity_pct": None,
            "condition": "WEATHER_UNAVAILABLE",
            "weather_code": -1,
            "rain_mm": None,
            "wind_speed_kmh": None,
            "wind_direction_deg": None,
            "wind_direction_compass": "N/A",
            "cloud_cover_pct": None,
            "risk_level": "WEATHER_UNAVAILABLE",
            "risk_indicators": [],
            "location_name": resolved_name,
            "latitude": round(lat, 4),
            "longitude": round(lon, 4),
            "hourly_forecast": [],
            "daily_forecast": [],
            "source": "Weather Service Unavailable (Offline)",
            "timestamp": now_iso,
            "is_stale": True,
        }

    def _save_record(self, reading: Dict[str, any]):
        session = self._get_session()
        try:
            record = WeatherRecord(
                temperature_c=reading.get("temperature_c"),
                condition=reading.get("condition", "Unknown"),
                rain_mm=reading.get("rain_mm"),
                wind_speed_kmh=reading.get("wind_speed_kmh"),
                risk_level=reading.get("risk_level", "SAFE"),
                source=reading.get("source", "Open-Meteo"),
            )
            session.add(record)
            session.commit()
        except Exception as e:
            print(f"[WeatherService] Database persist warning: {e}")
        finally:
            if self._external_session is None:
                session.close()

    def get_latest_persisted_record(self) -> Optional[WeatherRecord]:
        session = self._get_session()
        try:
            return session.query(WeatherRecord).order_by(WeatherRecord.timestamp.desc()).first()
        finally:
            if self._external_session is None:
                session.close()
