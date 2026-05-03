from __future__ import annotations

import asyncio

import structlog

log = structlog.get_logger()

# Bound per-subscriber queue: a slow SSE client can't grow memory unboundedly.
# When full we drop + log rather than block publishers (see publish() below).
_SUBSCRIBER_QUEUE_MAXSIZE = 100

# Process-local set, NOT shared across workers. Safe only because Fly machines
# run a single Uvicorn worker; SSE fan-out to multi-worker would need Redis.
_subscribers: set[asyncio.Queue] = set()


def subscribe() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=_SUBSCRIBER_QUEUE_MAXSIZE)
    _subscribers.add(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    _subscribers.discard(q)


async def publish(event: dict) -> None:
    # Snapshot subscribers (list(...)) so unsubscribe during iteration is safe.
    # put_nowait + drop-on-full keeps webhook/SSE producers non-blocking.
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            log.warning("event_bus_publish_dropped", payload=event)


def subscriber_count() -> int:
    return len(_subscribers)
