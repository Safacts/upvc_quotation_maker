import os
from supabase import create_client, Client

url = "https://effxrwrbsjduvhmorvrq.supabase.co"
key = "sb_publishable_GmfOXLriCvXdppszTkF6Mg_FuLXt6PN"

supabase: Client = create_client(url, key)

email = "kongaaadisheshu@gmail.com"
hash_val = "76ab9a422dcbeef43c1da0a4d22e558ff6f97f9b05342f4e24c5217a4d6bbae8"

try:
    response = supabase.table("admins").upsert({"email": email, "password_hash": hash_val}).execute()
    print("Success:", response)
except Exception as e:
    print("Error:", e)
