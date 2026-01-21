"""
Streaming utilities for progress updates.

In Lambda context, these are collected and returned in the response.
For WebSocket support, these would push to connected clients.
"""
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field
import time

# Global store for progress events (per-request)
_progress_events: List[Dict[str, Any]] = []
_image_events: List[Dict[str, Any]] = []


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
