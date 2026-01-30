"""
WebSocket endpoint for real-time task execution.

Provides step-by-step updates during task execution:
1. Client connects to /ws/run
2. Client sends task description
3. Server sends plan generation event
4. For each step:
   - Server sends step_start event
   - Server attempts to locate element
   - Server sends step_result event
   - Client acknowledges completion (or requests retry/skip)
5. Server sends task_complete event
"""

import asyncio
import base64
import json
from enum import Enum
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from PIL import Image

from engine.api.dependencies import get_cached_locator, get_cached_planner
from engine.utils.image import take_screenshot, draw_highlight


router = APIRouter()


class EventType(str, Enum):
    """WebSocket event types."""
    # Server -> Client
    CONNECTED = "connected"
    PLAN_STARTED = "plan_started"
    PLAN_READY = "plan_ready"
    PLAN_ERROR = "plan_error"
    STEP_STARTED = "step_started"
    STEP_RESULT = "step_result"
    STEP_ERROR = "step_error"
    TASK_COMPLETE = "task_complete"
    ERROR = "error"

    # Client -> Server
    START_TASK = "start_task"
    STEP_DONE = "step_done"
    STEP_RETRY = "step_retry"
    STEP_SKIP = "step_skip"
    CANCEL = "cancel"


class WebSocketEvent(BaseModel):
    """Base WebSocket event."""
    type: str
    data: Optional[dict] = None


def _encode_image_base64(img: Image.Image) -> str:
    """Encode PIL Image to base64 PNG."""
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


async def send_event(websocket: WebSocket, event_type: EventType, data: dict = None):
    """Send a typed event to the client."""
    event = {"type": event_type.value, "data": data or {}}
    await websocket.send_json(event)


@router.websocket("/ws/run")
async def websocket_task_runner(websocket: WebSocket):
    """
    WebSocket endpoint for real-time task execution.

    Protocol:
    1. Server sends "connected" event
    2. Client sends "start_task" with {"task": "Turn on dark mode"}
    3. Server sends "plan_started"
    4. Server sends "plan_ready" with plan
    5. For each step:
       - Server sends "step_started" with step info
       - Server sends "step_result" with location result + highlight image
       - Client sends "step_done" to proceed, "step_retry" to retry, or "step_skip" to skip
    6. Server sends "task_complete"

    Error events:
    - "plan_error": Failed to generate plan
    - "step_error": Failed to locate element
    - "error": General error
    """
    await websocket.accept()

    try:
        # Send connected event
        await send_event(websocket, EventType.CONNECTED, {
            "message": "Connected to CONU Engine"
        })

        # Wait for start_task message
        message = await websocket.receive_json()
        if message.get("type") != EventType.START_TASK.value:
            await send_event(websocket, EventType.ERROR, {
                "error": f"Expected start_task, got {message.get('type')}"
            })
            return

        task = message.get("data", {}).get("task", "")
        if not task:
            await send_event(websocket, EventType.ERROR, {
                "error": "No task provided"
            })
            return

        # Get dependencies
        planner = get_cached_planner()
        locator = get_cached_locator()

        # Take initial screenshot
        await send_event(websocket, EventType.PLAN_STARTED, {
            "task": task,
            "message": "Taking screenshot and generating plan..."
        })

        try:
            img = take_screenshot()
            plan = planner.generate_plan(img, task)
        except Exception as e:
            await send_event(websocket, EventType.PLAN_ERROR, {
                "error": str(e)
            })
            return

        # Send plan
        await send_event(websocket, EventType.PLAN_READY, {
            "task": plan.task,
            "steps": [s.to_dict() for s in plan.steps],
            "total_steps": len(plan.steps),
        })

        # Execute each step
        step_num = 0
        while not plan.is_complete:
            step = plan.next_step()
            if step is None:
                break

            step_num += 1

            # Send step started
            await send_event(websocket, EventType.STEP_STARTED, {
                "step_number": step_num,
                "total_steps": len(plan.steps),
                "instruction": step.instruction,
                "target": step.target_text,
                "region": step.region,
                "is_icon": step.is_icon,
            })

            # Small delay for user to position
            await asyncio.sleep(0.3)

            # Take fresh screenshot
            img = take_screenshot()

            # Locate element
            try:
                result = locator.locate(
                    img,
                    step.target_text,
                    region=step.region,
                    is_icon=step.is_icon,
                    instruction=step.instruction,
                    quad=step.quad,
                )
            except Exception as e:
                await send_event(websocket, EventType.STEP_ERROR, {
                    "step_number": step_num,
                    "error": str(e),
                })
                # Wait for client response
                response = await websocket.receive_json()
                response_type = response.get("type")
                if response_type == EventType.STEP_SKIP.value:
                    plan.advance()
                    continue
                elif response_type == EventType.CANCEL.value:
                    break
                # Otherwise retry
                continue

            # Prepare result data
            result_data = {
                "step_number": step_num,
                "found": result.found,
                "confidence": result.confidence,
                "method": result.method.value if result.method else None,
                "suggestions": result.suggestions,
            }

            if result.found and result.bbox:
                result_data["bbox"] = result.bbox.to_list()
                result_data["center"] = list(result.bbox.center)

                # Generate highlight image
                method_name = result.method.value if result.method else "unknown"
                highlight_img = draw_highlight(
                    img,
                    result.bbox,
                    instruction=step.instruction,
                    confidence=result.confidence,
                    method=method_name,
                )
                result_data["highlight_image"] = _encode_image_base64(highlight_img)

            await send_event(websocket, EventType.STEP_RESULT, result_data)

            # Wait for client acknowledgment
            response = await websocket.receive_json()
            response_type = response.get("type")

            if response_type == EventType.STEP_DONE.value:
                step.result = result
                plan.advance()
            elif response_type == EventType.STEP_RETRY.value:
                # Don't advance, retry on next iteration
                continue
            elif response_type == EventType.STEP_SKIP.value:
                plan.advance()
            elif response_type == EventType.CANCEL.value:
                break
            else:
                # Default: advance
                plan.advance()

        # Task complete
        await send_event(websocket, EventType.TASK_COMPLETE, {
            "task": plan.task,
            "steps_completed": plan.current_step,
            "total_steps": len(plan.steps),
            "success": plan.is_complete,
        })

    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        try:
            await send_event(websocket, EventType.ERROR, {
                "error": str(e)
            })
        except Exception:
            pass
        raise
