import os

from slowapi import Limiter
from slowapi.util import get_remote_address

if os.getenv("DISABLE_RATE_LIMIT"):
    class _NoOpLimiter:
        def limit(self, *args, **kwargs):
            def decorator(f):
                return f
            return decorator
    limiter = _NoOpLimiter()  # type: ignore[assignment] -- _NoOpLimiter duck-types Limiter's .limit() decorator
else:
    limiter = Limiter(key_func=get_remote_address)
