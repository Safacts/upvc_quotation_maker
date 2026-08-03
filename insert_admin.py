import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(url, key)

email = "vitarn.dev@gmail.com"
hash_val = "3d9128ffccc6317d850c003d720fe0f2aa15f88877afc039a5b3eabab2f4e3f9"

try:
    response = supabase.table("admins").upsert({"email": email, "password_hash": hash_val}).execute()
    print("Success:", response)
except Exception as e:
    print("Error:", e)
