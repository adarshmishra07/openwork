"""
Streaming utilities for progress updates.

Supports two modes:
1. Collect mode (default): Events stored in ProgressStore, returned in response.
2. SSE mode: Events pushed to an asyncio.Queue for real-time streaming.

The queue is stored in a contextvar so it propagates through
contextvars.copy_context().run() in SpaceExecutor threads.
"""
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
import asyncio
import contextvars
import time

# Global store for progress events (per-request)
_progress_events: List[Dict[str, Any]] = []
_image_events: List[Dict[str, Any]] = []

# SSE queue contextvar - set per-request for streaming mode
_request_queue: contextvars.ContextVar[Any] = contextvars.ContextVar('_request_queue', default=None)
# Store the event loop so threads can enqueue safely
_request_loop: contextvars.ContextVar[Any] = contextvars.ContextVar('_request_loop', default=None)


def set_request_queue(queue: Any, loop: Any = None):
    """Set the SSE queue for the current request context."""
    _request_queue.set(queue)
    _request_loop.set(loop or asyncio.get_event_loop())


def _enqueue(event: Dict[str, Any]):
    """Thread-safe enqueue to the SSE queue."""
    q = _request_queue.get(None)
    if q is None:
        return
    loop = _request_loop.get(None)
    if loop is not None:
        loop.call_soon_threadsafe(q.put_nowait, event)
    else:
        q.put_nowait(event)


@dataclass
class ProgressStore:
    """Store for progress events during execution."""
    events: List[Dict[str, Any]] = field(default_factory=list)
    images: List[Dict[str, Any]] = field(default_factory=list)


# Request-scoped store (in Lambda, each request is isolated)
_store = ProgressStore()


def stream_progress(
    id: str,
    status: str,
    wait_for: Optional[int] = None,
    message: Optional[str] = None
):
    """
    Record a progress event.

    Args:
        id: Progress step identifier (e.g., "analyze-request", "generate-assets")
        status: Status of the step ("started", "completed", "failed")
        wait_for: Optional estimated wait time in seconds
        message: Optional message for the step
    """
    event = {
        "type": "progress",
        "id": id,
        "status": status,
        "timestamp": time.time(),
    }
    if wait_for is not None:
        event["wait_for"] = wait_for
    if message is not None:
        event["message"] = message

    _store.events.append(event)

    # Push to SSE queue if in streaming mode
    _enqueue(event)

    # Also log for debugging
    from shared_libs.libs.logger import log
    log.info(f"[Progress] {id}: {status}" + (f" (wait: {wait_for}s)" if wait_for else ""))


def stream_image(url: str, label: str):
    """
    Record an image output event.

    Args:
        url: URL of the generated image
        label: Label for the image (e.g., "First shot", "Variation 2")
    """
    event = {
        "type": "image",
        "url": url,
        "label": label,
        "timestamp": time.time(),
    }
    _store.images.append(event)

    # Push to SSE queue if in streaming mode
    _enqueue(event)

    from shared_libs.libs.logger import log
    log.info(f"[Image] {label}: {url[:50]}...")


def get_progress_events() -> List[Dict[str, Any]]:
    """Get all recorded progress events."""
    return _store.events.copy()


def get_image_events() -> List[Dict[str, Any]]:
    """Get all recorded image events."""
    return _store.images.copy()


def clear_events():
    """Clear all events (call at start of each request)."""
    _store.events.clear()
    _store.images.clear()
