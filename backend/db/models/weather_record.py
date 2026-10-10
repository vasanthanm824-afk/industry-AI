"""
Weather Record Data Model
Stores environmental weather monitoring readings and automated risk index.
"""

from datetime import datetime
from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from backend.db.session import Base


class WeatherRecord(Base):
    __tablename__ = "weather_records"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    temperature_c = Column(Float, nullable=True)
    condition = Column(String(64), nullable=False, default="WEATHER_UNAVAILABLE")
    rain_mm = Column(Float, nullable=True, default=0.0)
    wind_speed_kmh = Column(Float, nullable=True, default=0.0)
    risk_level = Column(String(32), nullable=False, default="SAFE")  # SAFE, CAUTION, HIGH_RISK, WEATHER_UNAVAILABLE
    source = Column(String(64), default="Open-Meteo / Environmental Sensor")
    details_json = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "temperature_c": self.temperature_c,
            "condition": self.condition,
            "rain_mm": self.rain_mm,
            "wind_speed_kmh": self.wind_speed_kmh,
            "risk_level": self.risk_level,
            "source": self.source,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }
