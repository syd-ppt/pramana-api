"""Backblaze B2 storage client - Serverless-optimized."""
from __future__ import annotations

import asyncio
import logging
import os
from io import BytesIO

from b2sdk.v2 import B2Api, InMemoryAccountInfo


class B2Client:
    """Backblaze B2 uploader for serverless environments.

    Creates lightweight connection per request, suitable for Vercel serverless functions.
    """

    MAX_SCAN_FILES = 1000

    def __init__(self):
        self.key_id = os.getenv("B2_APPLICATION_KEY_ID") or os.getenv("B2_KEY_ID")
        self.app_key = os.getenv("B2_APPLICATION_KEY")
        self.bucket_name = os.getenv("B2_BUCKET_NAME")

        if not self.bucket_name:
            raise ValueError(
                "B2_BUCKET_NAME not set. Set the B2_BUCKET_NAME env var."
            )

        if not self.key_id or not self.app_key:
            raise ValueError(
                "B2 credentials not set. Set B2_KEY_ID and B2_APPLICATION_KEY env vars."
            )

        # Initialize API (lightweight operation)
        self.api = B2Api(InMemoryAccountInfo())
        self.api.authorize_account("production", self.key_id, self.app_key)
        self.bucket = self.api.get_bucket_by_name(self.bucket_name)

    async def upload_file(self, key: str, data: bytes) -> str:
        """Upload bytes to B2 and return public URL.

        Args:
            key: Remote file path/key (e.g., "year=2024/month=01/day=15/file.parquet")
            data: File content as bytes

        Returns:
            Public download URL for the uploaded file
        """
        # Run synchronous B2 SDK in thread pool to avoid blocking
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: self.bucket.upload_bytes(
                data_bytes=data,
                file_name=key,
            )
        )

        # Return download URL
        return self.get_public_url(key)

    def get_public_url(self, file_name: str) -> str:
        """Get public download URL for a file."""
        return self.api.get_download_url_for_file_name(self.bucket_name, file_name)

    async def delete_user_data(self, user_id: str) -> int:
        """Delete all files for a specific user (GDPR compliance).

        Args:
            user_id: User ID to delete data for

        Returns:
            Number of files deleted
        """
        loop = asyncio.get_running_loop()

        def list_and_delete():
            deleted = 0
            scanned = 0
            for file_version, _ in self.bucket.ls(recursive=True):
                scanned += 1
                if scanned > self.MAX_SCAN_FILES:
                    logging.warning("GDPR deletion scan capped at %d files for user %s", self.MAX_SCAN_FILES, user_id)
                    break
                if f"/user={user_id}/" in file_version.file_name:
                    self.api.delete_file_version(file_version.id_, file_version.file_name)
                    deleted += 1
            return deleted

        return await loop.run_in_executor(None, list_and_delete)

    async def repartition_user_data(self, from_user_id: str, to_user_id: str) -> int:
        """Move user data to a different partition (for anonymization).

        Args:
            from_user_id: Source user ID
            to_user_id: Destination user ID (usually "anonymous")

        Returns:
            Number of files moved
        """
        loop = asyncio.get_running_loop()

        def copy_and_delete():
            moved = 0
            scanned = 0
            for file_version, _ in self.bucket.ls(recursive=True):
                scanned += 1
                if scanned > self.MAX_SCAN_FILES:
                    logging.warning("GDPR deletion scan capped at %d files for user %s", self.MAX_SCAN_FILES, from_user_id)
                    break
                if f"/user={from_user_id}/" not in file_version.file_name:
                    continue

                # Read file content
                download_dest = BytesIO()
                self.bucket.download_file_by_name(file_version.file_name).save(download_dest)

                # Create new key with different user partition
                old_path = file_version.file_name
                new_path = old_path.replace(f"user={from_user_id}/", f"user={to_user_id}/")

                # Upload to new location
                download_dest.seek(0)
                self.bucket.upload_bytes(
                    data_bytes=download_dest.read(),
                    file_name=new_path,
                )

                # Delete old file
                self.api.delete_file_version(file_version.id_, file_version.file_name)
                moved += 1

            return moved

        return await loop.run_in_executor(None, copy_and_delete)
