"""Cloudflare R2 storage client — S3-compatible, serverless-optimized."""
from __future__ import annotations

import asyncio
import logging
import os
from io import BytesIO

import boto3


class StorageClient:
    """S3-compatible object storage client for Cloudflare R2.

    Drop-in replacement for the old B2Client. All consumers use the same
    public API: upload_file, list_files, download_file, delete_file.
    """

    MAX_SCAN_FILES = 1000

    def __init__(self):
        self.endpoint_url = os.getenv("R2_ENDPOINT_URL")
        self.access_key = os.getenv("R2_ACCESS_KEY_ID")
        self.secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
        self.bucket_name = os.getenv("R2_BUCKET_NAME")

        if not self.bucket_name:
            raise ValueError("R2_BUCKET_NAME not set.")
        if not self.endpoint_url:
            raise ValueError("R2_ENDPOINT_URL not set.")
        if not self.access_key or not self.secret_key:
            raise ValueError("R2 credentials not set. Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.")

        self.s3 = boto3.client(
            "s3",
            endpoint_url=self.endpoint_url,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name="auto",
        )

    # ── Write ──────────────────────────────────────────────

    async def upload_file(self, key: str, data: bytes) -> str:
        """Upload bytes to R2. Returns the object key."""
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: self.s3.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=data,
            ),
        )
        return key

    # ── Read ───────────────────────────────────────────────

    def list_files(self, prefix: str = "", max_keys: int = 1000) -> list[str]:
        """List object keys under prefix. Handles pagination."""
        keys: list[str] = []
        paginator = self.s3.get_paginator("list_objects_v2")
        for page in paginator.paginate(
            Bucket=self.bucket_name,
            Prefix=prefix,
            PaginationConfig={"MaxItems": max_keys},
        ):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
        return keys

    def download_file(self, key: str) -> bytes:
        """Download object bytes by key."""
        resp = self.s3.get_object(Bucket=self.bucket_name, Key=key)
        return resp["Body"].read()

    # ── Delete ─────────────────────────────────────────────

    async def delete_user_data(self, user_id: str) -> int:
        """Delete all files for a user (GDPR). Returns count deleted."""
        loop = asyncio.get_running_loop()

        def _delete():
            keys = self.list_files(max_keys=self.MAX_SCAN_FILES)
            to_delete = [k for k in keys if f"/user={user_id}/" in k]
            if not to_delete:
                return 0
            self.s3.delete_objects(
                Bucket=self.bucket_name,
                Delete={"Objects": [{"Key": k} for k in to_delete]},
            )
            return len(to_delete)

        return await loop.run_in_executor(None, _delete)

    async def repartition_user_data(self, from_user_id: str, to_user_id: str) -> int:
        """Copy files to new user partition, delete originals (GDPR anonymization)."""
        loop = asyncio.get_running_loop()

        def _move():
            keys = self.list_files(max_keys=self.MAX_SCAN_FILES)
            matched = [k for k in keys if f"/user={from_user_id}/" in k]
            for old_key in matched:
                new_key = old_key.replace(f"user={from_user_id}/", f"user={to_user_id}/")
                self.s3.copy_object(
                    Bucket=self.bucket_name,
                    CopySource={"Bucket": self.bucket_name, "Key": old_key},
                    Key=new_key,
                )
                self.s3.delete_object(Bucket=self.bucket_name, Key=old_key)
            return len(matched)

        return await loop.run_in_executor(None, _move)


# Backward-compatible alias — all imports use `from backend.storage.b2_client import B2Client`
B2Client = StorageClient
