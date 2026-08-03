import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(url, key)

email = "vitarn.dev@gmail.com"
hash_val = "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9"

try:
    response = supabase.table("admins").upsert({"email": email, "password_hash": hash_val}).execute()
    print("Success:", response)
except Exception as e:
    print("Error:", e)
