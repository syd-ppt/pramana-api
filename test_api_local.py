#!/usr/bin/env python3
"""Test API submission endpoint locally to debug issues."""

import json
import sys
from pathlib import Path

# Add API to path
sys.path.insert(0, str(Path(__file__).parent))

def test_imports():
    """Test if all required modules can be imported."""
    print("Testing imports...")
    try:
        import fastapi
        print("  ✓ fastapi")
    except ImportError as e:
        print(f"  ✗ fastapi: {e}")

    try:
        import pyarrow
        print("  ✓ pyarrow")
    except ImportError as e:
        print(f"  ✗ pyarrow: {e}")

    try:
        import boto3
        print("  ✓ boto3")
    except ImportError as e:
        print(f"  ✗ boto3: {e}")

    try:
        import jwt
        print("  ✓ pyjwt")
    except ImportError as e:
        print(f"  ✗ pyjwt: {e}")

def test_storage_client():
    """Test StorageClient initialization."""
    print("\nTesting StorageClient...")
    import os

    # Check env vars
    print(f"  STORAGE_ENDPOINT_URL: {'SET' if os.getenv('STORAGE_ENDPOINT_URL') else 'NOT SET'}")
    print(f"  STORAGE_ACCESS_KEY_ID: {'SET' if os.getenv('STORAGE_ACCESS_KEY_ID') else 'NOT SET'}")
    print(f"  STORAGE_SECRET_ACCESS_KEY: {'SET' if os.getenv('STORAGE_SECRET_ACCESS_KEY') else 'NOT SET'}")
    print(f"  STORAGE_BUCKET_NAME: {os.getenv('STORAGE_BUCKET_NAME', 'NOT SET')}")

    if not os.getenv('STORAGE_ENDPOINT_URL') or not os.getenv('STORAGE_ACCESS_KEY_ID'):
        print("  ⚠ Skipping storage test - credentials not set")
        return

    try:
        from backend.storage.client import StorageClient
        client = StorageClient()
        print("  ✓ StorageClient initialized successfully")
    except Exception as e:
        print(f"  ✗ StorageClient failed: {e}")

def test_api_route():
    """Test the submit route handler."""
    print("\nTesting API route...")

    try:
        from backend.routes import submit
        print("  ✓ Import submit module")

        # Test with mock data
        test_data = {
            "model_id": "claude-sonnet-4",
            "prompt_id": "test-001",
            "output": "test output",
            "metadata": {}
        }

        print(f"  Test payload: {json.dumps(test_data, indent=2)}")

    except Exception as e:
        print(f"  ✗ Route test failed: {e}")
        import traceback
        traceback.print_exc()

def main():
    print("=" * 60)
    print("API Debugging Tests")
    print("=" * 60)

    test_imports()
    test_storage_client()
    test_api_route()

    print("\n" + "=" * 60)
    print("Tests complete")

if __name__ == "__main__":
    main()
