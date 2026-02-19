"""User management API routes - GDPR compliance."""

from fastapi import APIRouter, Header, HTTPException, Query
from api.storage.b2_client import B2Client
from api.routes.submit import validate_token

router = APIRouter()


@router.delete("/user/me")
async def delete_my_data(
    authorization: str = Header(...),
    anonymize_only: bool = Query(False, description="Keep results as anonymous instead of deletion")
):
    """Delete or anonymize user data (GDPR compliance).

    Args:
        authorization: Bearer token (required)
        anonymize_only: If True, keep results but remove user link.
                       If False, delete all user data completely.

    Returns:
        Status of deletion/anonymization
    """
    # Validate token and get user_id
    user_id = validate_token(authorization)

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required for data deletion"
        )

    b2_client = B2Client()

    if anonymize_only:
        # Anonymize: re-partition files from user={user_id}/ to user=anonymous/
        try:
            await b2_client.repartition_user_data(
                from_user_id=user_id,
                to_user_id="anonymous"
            )
            return {
                "status": "anonymized",
                "user_id": user_id,
                "message": "Your submissions are now anonymous but still contribute to crowd statistics"
            }
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Anonymization failed: {str(e)}"
            )
    else:
        # Full deletion: remove all files under user={user_id}/
        try:
            deleted_count = await b2_client.delete_user_data(user_id)
            return {
                "status": "deleted",
                "user_id": user_id,
                "files_deleted": deleted_count,
                "message": "All your data has been permanently deleted"
            }
        except Exception as e:
            raise HTTPException(
                status_code=500,
                detail=f"Deletion failed: {str(e)}"
            )


@router.get("/user/me/stats")
async def get_my_stats(
    authorization: str = Header(...)
):
    """Get personalized statistics for authenticated user.

    Returns user's pass rates, submission count, and comparison to crowd averages.
    """
    # Validate token and get user_id
    user_id = validate_token(authorization)

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required"
        )

    raise HTTPException(
        status_code=501,
        detail="Stats endpoint not yet implemented"
    )
