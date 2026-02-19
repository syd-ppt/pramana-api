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
        from b2sdk.v2 import B2Api
        print("  ✓ b2sdk")
    except ImportError as e:
        print(f"  ✗ b2sdk: {e}")

    try:
        import jwt
        print("  ✓ pyjwt")
    except ImportError as e:
        print(f"  ✗ pyjwt: {e}")

def test_b2_client():
    """Test B2Client initialization."""
    print("\nTesting B2Client...")
    import os

    # Check env vars
    print(f"  B2_KEY_ID: {'SET' if os.getenv('B2_KEY_ID') else 'NOT SET'}")
    print(f"  B2_APPLICATION_KEY: {'SET' if os.getenv('B2_APPLICATION_KEY') else 'NOT SET'}")
    print(f"  B2_BUCKET_NAME: {os.getenv('B2_BUCKET_NAME', 'NOT SET')}")

    if not os.getenv('B2_KEY_ID') or not os.getenv('B2_APPLICATION_KEY'):
        print("  ⚠ Skipping B2 test - credentials not set")
        return

    try:
        from api.storage.b2_client import B2Client
        client = B2Client()
        print("  ✓ B2Client initialized successfully")
    except Exception as e:
        print(f"  ✗ B2Client failed: {e}")

def test_api_route():
    """Test the submit route handler."""
    print("\nTesting API route...")

    try:
        from api.routes import submit
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
    test_b2_client()
    test_api_route()

    print("\n" + "=" * 60)
    print("Tests complete")

if __name__ == "__main__":
    main()
