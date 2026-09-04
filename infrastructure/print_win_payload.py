import os
import psycopg2
import json

try:
    db_url = os.environ.get("DATABASE_URL", "postgresql://monitoring:qRLkVs9qF68_G2xNsJXrCQ@db-postgres:5432/monitoring")
    # Replace asyncpg driver with psycopg2
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT payload FROM metrics WHERE payload->'system_info'->>'os' LIKE '%windows%' ORDER BY received_at DESC LIMIT 1;")
    row = cur.fetchone()
    if row:
        payload = row[0]
        print("=== WINDOWS METRIC PAYLOAD KEYS ===")
        for k, v in payload.items():
            if v is None:
                print(f"{k}: None")
            elif isinstance(v, list):
                print(f"{k}: list (len={len(v)})")
            elif isinstance(v, dict):
                print(f"{k}: dict (keys={list(v.keys())})")
            else:
                print(f"{k}: {v}")
        
        print("\n=== SERVICES DETAILED ===")
        print("services len:", len(payload.get("services") or []))
        print("services sample:", (payload.get("services") or [])[:5])
        
        print("\n=== DOCKER DETAILED ===")
        print("docker_containers len:", len(payload.get("docker_containers") or []))
        print("docker_containers sample:", (payload.get("docker_containers") or [])[:5])
        
        print("\n=== SECURITY DETAILED ===")
        print("security:", payload.get("security"))
        
        print("\n=== LOGS DETAILED ===")
        print("recent_logs:", payload.get("recent_logs"))
    else:
        print("[!] No Windows agent metrics found in database.")
    cur.close()
    conn.close()
except Exception as e:
    print("[x] Error querying database:", e)
