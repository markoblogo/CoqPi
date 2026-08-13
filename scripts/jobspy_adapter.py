#!/usr/bin/env python3
"""Optional bounded JobSpy adapter. Reads one JSON request and writes compact JSON."""

import json
import sys


def main():
    request = json.load(sys.stdin)
    try:
        from jobspy import scrape_jobs
    except ImportError:
        raise RuntimeError("JobSpy is not installed in the configured Python environment.")

    frame = scrape_jobs(
        site_name=request.get("sites", ["indeed", "google"]),
        search_term=request["query"],
        location=request.get("location") or None,
        results_wanted=min(int(request.get("limit", 10)), 20),
        hours_old=min(int(request.get("hoursOld", 720)), 8760),
        country_indeed=request.get("country", "France"),
    )
    rows = []
    for row in frame.fillna("").to_dict(orient="records"):
        rows.append({
            "id": str(row.get("id", "")),
            "site": str(row.get("site", "jobspy")),
            "title": str(row.get("title", "")),
            "company": str(row.get("company", "")),
            "location": str(row.get("location", "")),
            "description": str(row.get("description", ""))[:1200],
            "jobUrl": str(row.get("job_url_direct") or row.get("job_url") or ""),
            "datePosted": str(row.get("date_posted", "")),
        })
    json.dump({"results": rows}, sys.stdout)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        json.dump({"error": str(error)}, sys.stdout)
        sys.exit(1)
