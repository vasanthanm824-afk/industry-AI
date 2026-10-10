#!/usr/bin/env python3
"""
Attendance Verification & Roster Query Utility
Displays real-time and historical shift attendance records from the database.

Usage:
  python scripts/view_attendance.py
  python scripts/view_attendance.py --date 2026-10-06
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.services.attendance_service import AttendanceService


def main():
    parser = argparse.ArgumentParser(description="Query Daily Worker Attendance Roster")
    parser.add_argument("--date", type=str, default=None, help="Target date in YYYY-MM-DD format (defaults to today).")
    args = parser.parse_args()

    service = AttendanceService()
    records = service.get_today_attendance(date_str=args.date)

    query_date = args.date or "TODAY"
    print("\n" + "=" * 75)
    print(f"OFFICIAL SHIFT ATTENDANCE ROSTER ({query_date}) - Total Present: {len(records)}")
    print("=" * 75)

    if not records:
        print("  No attendance records found for this date.")
    else:
        print(f"  {'Worker ID':<12} {'Worker Name':<20} {'First Seen':<12} {'Last Seen':<12} {'Status':<10} {'Confidence'}")
        print("  " + "-" * 71)
        for r in records:
            print(f"  {r.worker_id:<12} {r.worker_name:<20} {r.first_seen_time:<12} {r.last_seen_time:<12} {r.attendance_status:<10} {r.confidence:.1%}")

    print("=" * 75 + "\n")


if __name__ == "__main__":
    main()
