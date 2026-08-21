import psycopg2
import os

SUPABASE_DB_PASSWORD = os.environ.get('SUPABASE_DB_PASSWORD')
if not SUPABASE_DB_PASSWORD:
    try:
        with open('.env') as f:
            for line in f:
                if line.startswith('SUPABASE_DB_PASSWORD='):
                    SUPABASE_DB_PASSWORD = line.split('=', 1)[1].strip()
    except:
        pass

DB_URL = f"postgresql://postgres:{SUPABASE_DB_PASSWORD}@db.gumpmnbjdtzajhysnnaz.supabase.co:5432/postgres"

with open('combined_foundation.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

print("Executing SQL...")
try:
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(sql)
    print("Migration successful!")
except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()

