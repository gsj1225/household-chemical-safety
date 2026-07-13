"""Demo 单进程滑动窗口限流器；生产环境应替换为共享存储实现。"""

import time
from collections import defaultdict, deque
from threading import RLock


class SlidingWindowRateLimiter:
    def __init__(self, max_keys: int = 10_000):
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = RLock()
        self._max_keys = max_keys

    def check(self, key: str, limit: int, window_seconds: int = 60) -> tuple[bool, int]:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            if len(self._events) >= self._max_keys and key not in self._events:
                stale = [
                    item_key for item_key, values in self._events.items()
                    if not values or values[-1] <= cutoff
                ]
                for item_key in stale:
                    self._events.pop(item_key, None)
                if len(self._events) >= self._max_keys:
                    self._events.pop(next(iter(self._events)))
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(window_seconds - (now - events[0])) + 1)
                return False, retry_after
            events.append(now)
            return True, 0

    def clear(self) -> None:
        with self._lock:
            self._events.clear()


rate_limiter = SlidingWindowRateLimiter()
