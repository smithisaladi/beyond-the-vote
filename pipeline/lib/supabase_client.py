import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load .env from project root (one level above pipeline/)
load_dotenv(Path(__file__).parent.parent.parent / ".env.local")
load_dotenv(Path(__file__).parent.parent.parent / ".env")


def create_service_client() -> Client:
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)
