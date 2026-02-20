"""Ultra-minimal handler - no dependencies."""


def handler(request, context):
    """Minimal Vercel handler."""
    return {
        "statusCode": 200,
        "body": "pong"
    }
