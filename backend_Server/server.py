#!/usr/bin/env python3
"""
FastAPI server that wraps the existing final.py transcription pipeline,
exposing all CLI functionality as REST endpoints + a WebSocket for live status.
"""

import asyncio
import json
import time
import os
import numpy as np
import sounddevice as sd
import torch

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from threading import Thread

# Import core engine from final.py
from final import (
    CONFIG, Colors, printf,
    load_saved_config, save_config,
    loadmodels, identify_speaker,
    audiobufferingthread, processingthread, apisenderthread,
    cleanupthreads, starttranscribing, post_meeting_chat,
    stopevent, threadslist, GLOBAL_TRANSCRIPT,
    set_volume_callback, set_transcription_callback,
    SAMPLERATE, OUTPUTDIR
)

# ──────────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────────

app = FastAPI(
    title="EchoVault Backend API",
    description="REST + WebSocket API for the real-time transcription pipeline",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────
# Shared State
# ──────────────────────────────────────────────

class ServerState:
    models_loaded: bool = False
    models_loading: bool = False
    is_recording: bool = False
    last_volume: float = 0.0
    enrolled_speakers: List[str] = []
    recording_threads: list = []

state = ServerState()

# WebSocket connections for live status
ws_clients: list[WebSocket] = []


async def broadcast_ws(event_type: str, data: dict):
    """Broadcast a message to all connected WebSocket clients."""
    message = json.dumps({"type": event_type, **data})
    disconnected = []
    for ws in ws_clients:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        ws_clients.remove(ws)


# Volume callback: runs in audio thread, schedule async broadcast
_loop: Optional[asyncio.AbstractEventLoop] = None

def _on_volume(vol: float):
    state.last_volume = vol
    if _loop and ws_clients:
        asyncio.run_coroutine_threadsafe(
            broadcast_ws("volume", {"level": round(vol, 1)}),
            _loop,
        )

def _on_transcription(payload: dict):
    if _loop and ws_clients:
        asyncio.run_coroutine_threadsafe(
            broadcast_ws("transcription", payload),
            _loop,
        )

set_volume_callback(_on_volume)
set_transcription_callback(_on_transcription)


@app.on_event("startup")
async def startup():
    global _loop
    _loop = asyncio.get_event_loop()
    # Load saved config at startup
    saved = load_saved_config()
    CONFIG.apiurl = saved.get("apiurl", "")
    CONFIG.room_id = saved.get("room_id", "")
    CONFIG.whisper_model_size = saved.get("whisper_model_size", "small")
    CONFIG.input_device_index = saved.get("input_device_index", None)


# ──────────────────────────────────────────────
# Pydantic Models
# ──────────────────────────────────────────────

class ConfigPayload(BaseModel):
    apiurl: Optional[str] = None
    room_id: Optional[str] = Field(None, pattern=r"^[A-Za-z0-9]{6}$")
    whisper_model_size: Optional[str] = Field(None, pattern=r"^(tiny|small|medium|large)$")

class DeviceSelectPayload(BaseModel):
    device_index: int

class EnrollPayload(BaseModel):
    speaker_name: str
    duration_seconds: int = Field(default=10, ge=3, le=30)

class StopPayload(BaseModel):
    generate_summary: bool = False


# ──────────────────────────────────────────────
# GET /status — Full system status
# ──────────────────────────────────────────────

@app.get("/status")
async def get_status():
    device_name = None
    try:
        idx = getattr(CONFIG, "input_device_index", None)
        if idx is not None:
            device_name = sd.query_devices(idx)["name"]
        else:
            device_name = sd.query_devices(kind="input")["name"]
    except Exception:
        pass

    return {
        "connected": True,
        "models_loaded": state.models_loaded,
        "models_loading": state.models_loading,
        "is_recording": state.is_recording,
        "room_id": CONFIG.room_id or None,
        "apiurl": CONFIG.apiurl or None,
        "whisper_model_size": CONFIG.whisper_model_size or "small",
        "input_device_index": getattr(CONFIG, "input_device_index", None),
        "input_device_name": device_name,
        "device_compute": CONFIG.device,
        "enrolled_speakers": state.enrolled_speakers,
        "volume": round(state.last_volume, 1),
        "transcript_count": len(GLOBAL_TRANSCRIPT),
    }


# ──────────────────────────────────────────────
# POST /config — Update configuration
# ──────────────────────────────────────────────

@app.post("/config")
async def update_config(payload: ConfigPayload):
    if payload.apiurl is not None:
        CONFIG.apiurl = payload.apiurl
    if payload.room_id is not None:
        CONFIG.room_id = payload.room_id
    if payload.whisper_model_size is not None:
        CONFIG.whisper_model_size = payload.whisper_model_size

    save_config(
        CONFIG.apiurl or "",
        CONFIG.room_id or "",
        CONFIG.whisper_model_size or "small",
        getattr(CONFIG, "input_device_index", None),
    )

    return {"success": True, "message": "Configuration updated."}


# ──────────────────────────────────────────────
# POST /models/load — Load AI models (background)
# ──────────────────────────────────────────────

def _load_models_task():
    try:
        state.models_loading = True
        if _loop:
            asyncio.run_coroutine_threadsafe(
                broadcast_ws("status", {"models_loading": True}), _loop
            )
        loadmodels()
        state.models_loaded = True
        state.models_loading = False
        if _loop:
            asyncio.run_coroutine_threadsafe(
                broadcast_ws("status", {"models_loaded": True, "models_loading": False}), _loop
            )
    except Exception as e:
        state.models_loading = False
        printf(f"Model loading failed: {e}", Colors.FAIL)
        if _loop:
            asyncio.run_coroutine_threadsafe(
                broadcast_ws("error", {"message": f"Model loading failed: {e}"}), _loop
            )


@app.post("/models/load")
async def load_models(background_tasks: BackgroundTasks):
    if state.models_loaded:
        return {"success": False, "message": "Models are already loaded."}
    if state.models_loading:
        return {"success": False, "message": "Models are currently loading."}

    background_tasks.add_task(_load_models_task)
    return {"success": True, "message": "Model loading started in background."}


# ──────────────────────────────────────────────
# POST /models/unload — Free VRAM
# ──────────────────────────────────────────────

@app.post("/models/unload")
async def unload_models():
    if state.is_recording:
        return {"success": False, "message": "Stop recording before unloading models."}

    import gc
    CONFIG.whispermodel = None
    CONFIG.speakermodel = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    state.models_loaded = False
    return {"success": True, "message": "Models unloaded, VRAM freed."}


# ──────────────────────────────────────────────
# GET /devices — List audio input devices
# ──────────────────────────────────────────────

@app.get("/devices")
async def list_devices():
    try:
        devices = sd.query_devices()
        input_devices = []
        default_idx = sd.default.device[0]
        for i, dev in enumerate(devices):
            if dev["max_input_channels"] > 0:
                input_devices.append({
                    "index": i,
                    "name": dev["name"],
                    "channels": dev["max_input_channels"],
                    "is_default": i == default_idx,
                    "is_selected": getattr(CONFIG, "input_device_index", None) == i,
                })
        return {"success": True, "devices": input_devices}
    except Exception as e:
        return {"success": False, "error": str(e), "devices": []}


# ──────────────────────────────────────────────
# POST /devices/select — Select input device
# ──────────────────────────────────────────────

@app.post("/devices/select")
async def select_device(payload: DeviceSelectPayload):
    try:
        dev = sd.query_devices(payload.device_index)
        if dev["max_input_channels"] <= 0:
            return {"success": False, "message": "Not an input device."}
        CONFIG.input_device_index = payload.device_index
        save_config(
            CONFIG.apiurl or "",
            CONFIG.room_id or "",
            CONFIG.whisper_model_size or "small",
            CONFIG.input_device_index,
        )
        return {"success": True, "message": f"Selected: {dev['name']}"}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ──────────────────────────────────────────────
# POST /devices/test — Test microphone (3s recording)
# ──────────────────────────────────────────────

@app.post("/devices/test")
async def test_device():
    device_idx = getattr(CONFIG, "input_device_index", None)
    try:
        volumes = []
        import time
        
        # Get the native sample rate to avoid 'Invalid sample rate' errors on raw hw devices
        device_info = sd.query_devices(device_idx) if device_idx is not None else sd.query_devices(kind="input")
        native_sr = int(device_info['default_samplerate'])

        def test_cb(indata, frames, time_info, status):
            vol = float(np.linalg.norm(indata) * 10)
            volumes.append(round(vol, 1))
            
            now = time.time()
            if getattr(test_cb, 'last_ws', 0) < now - 0.1:
                test_cb.last_ws = now
                if _loop and ws_clients:
                    asyncio.run_coroutine_threadsafe(
                        broadcast_ws("test_volume", {"level": round(vol, 1)}),
                        _loop,
                    )

        with sd.InputStream(device=device_idx, channels=1, samplerate=native_sr, callback=test_cb):
            sd.sleep(3000)

        avg_vol = round(sum(volumes) / max(len(volumes), 1), 1)
        max_vol = round(max(volumes) if volumes else 0, 1)
        return {
            "success": True,
            "avg_volume": avg_vol,
            "max_volume": max_vol,
            "sample_count": len(volumes),
        }
    except Exception as e:
        return {"success": False, "message": str(e)}


# ──────────────────────────────────────────────
# POST /enroll — Speaker enrollment
# ──────────────────────────────────────────────

@app.post("/enroll")
async def enroll_speaker(payload: EnrollPayload):
    if not state.models_loaded:
        return {"success": False, "message": "Load models first."}
    if getattr(CONFIG, "speakermodel", None) is None:
        return {"success": False, "message": "Speaker model not available."}

    device_idx = getattr(CONFIG, "input_device_index", None)
    duration = payload.duration_seconds
    name = payload.speaker_name.strip()
    if not name:
        return {"success": False, "message": "Speaker name is required."}

    try:
        import librosa
        recording = []
        
        device_info = sd.query_devices(device_idx) if device_idx is not None else sd.query_devices(kind="input")
        native_sr = int(device_info['default_samplerate'])

        def rec_callback(indata, frames, t, status):
            recording.append(indata.copy())
            vol = float(np.linalg.norm(indata) * 10)
            if _loop and ws_clients:
                asyncio.run_coroutine_threadsafe(
                    broadcast_ws("enrollment_volume", {"level": round(vol, 1), "speaker": name}),
                    _loop,
                )

        # Broadcast enrollment start
        if _loop:
            await broadcast_ws("enrollment_status", {"status": "recording", "speaker": name, "duration": duration})

        with sd.InputStream(device=device_idx, channels=1, samplerate=native_sr, callback=rec_callback):
            sd.sleep(duration * 1000)

        # Concatenate recorded frames into a single 1D numpy array
        audio_data = np.concatenate(recording, axis=0).flatten()
        
        # Resample to 16000Hz for the ECAPA-TDNN model
        if native_sr != SAMPLERATE:
            print(f"Resampling enrollment audio from {native_sr} to {SAMPLERATE}")
            audio_data = librosa.resample(audio_data, orig_sr=native_sr, target_sr=SAMPLERATE)

        # Extract embedding
        audio_tensor = torch.from_numpy(audio_data).float()
        with torch.no_grad():
            emb = CONFIG.speakermodel.encode_batch(audio_tensor.unsqueeze(0))
            emb = emb.squeeze(0).squeeze(0).numpy()

        CONFIG.speaker_centroids.append(emb)
        CONFIG.speaker_names.append(name)
        state.enrolled_speakers.append(name)

        CONFIG.enrolled = True

        if _loop:
            await broadcast_ws("enrollment_status", {"status": "complete", "speaker": name})

        return {
            "success": True,
            "message": f"Enrolled speaker: {name}",
            "enrolled_count": len(CONFIG.speaker_centroids),
            "enrollment_complete": getattr(CONFIG, "enrolled", False),
        }
    except Exception as e:
        return {"success": False, "message": f"Enrollment failed: {e}"}


# ──────────────────────────────────────────────
# POST /transcription/start — Start pipeline
# ──────────────────────────────────────────────

@app.post("/transcription/start")
async def start_transcription():
    if state.is_recording:
        return {"success": False, "message": "Already recording."}
    if not state.models_loaded:
        return {"success": False, "message": "Load models first."}
    if not CONFIG.room_id:
        return {"success": False, "message": "Set a room_id first via /config."}
    if not CONFIG.apiurl:
        return {"success": False, "message": "Set the frontend API URL first via /config."}

    import glob
    # Clean old segments
    try:
        old_segs = glob.glob(os.path.join(OUTPUTDIR, "*.wav"))
        for f in old_segs:
            os.remove(f)
    except Exception:
        pass

    # Reset state
    GLOBAL_TRANSCRIPT.clear()
    stopevent.clear()

    from final import processingq, apiq, audioq
    # Drain queues
    for q in [processingq, apiq, audioq]:
        while not q.empty():
            try:
                q.get_nowait()
            except Exception:
                break

    t1 = Thread(target=audiobufferingthread, name="AudioBuffer", daemon=True)
    t2 = Thread(target=processingthread, name="Processing", daemon=True)
    t3 = Thread(target=apisenderthread, name="APISender", daemon=True)

    state.recording_threads = [t1, t2, t3]
    # Also update the global threadslist for cleanupthreads()
    from final import threadslist as tl
    tl.clear()
    tl.extend(state.recording_threads)

    for t in state.recording_threads:
        t.start()

    state.is_recording = True

    if _loop:
        await broadcast_ws("status", {"is_recording": True})

    return {"success": True, "message": "Transcription started."}


# ──────────────────────────────────────────────
# POST /transcription/stop — Stop pipeline
# ──────────────────────────────────────────────

@app.post("/transcription/stop")
async def stop_transcription(payload: StopPayload = StopPayload()):
    if not state.is_recording:
        return {"success": False, "message": "Not currently recording."}

    stopevent.set()

    for t in state.recording_threads:
        t.join(timeout=5.0)

    state.is_recording = False
    state.recording_threads = []
    transcript_count = len(GLOBAL_TRANSCRIPT)

    if _loop:
        await broadcast_ws("status", {"is_recording": False})

    result = {
        "success": True,
        "message": "Transcription stopped.",
        "transcript_count": transcript_count,
    }

    if payload.generate_summary and transcript_count > 0:
        result["message"] = "Transcription stopped. Summary generation is available via the CLI."
        # NOTE: post_meeting_chat() requires stdin interaction (Qwen LLM),
        # so it's not exposed as a web endpoint. The transcript is still
        # accessible via /status for frontend-side summary generation.

    return result


# ──────────────────────────────────────────────
# GET /transcript — Get current transcript
# ──────────────────────────────────────────────

@app.get("/transcript")
async def get_transcript():
    return {
        "transcript": list(GLOBAL_TRANSCRIPT),
        "count": len(GLOBAL_TRANSCRIPT),
    }


# ──────────────────────────────────────────────
# POST /speakers/reset — Reset speaker enrollments
# ──────────────────────────────────────────────

@app.post("/speakers/reset")
async def reset_speakers():
    CONFIG.speaker_centroids = []
    CONFIG.speaker_names = []
    CONFIG.enrolled = False
    state.enrolled_speakers = []
    return {"success": True, "message": "Speaker enrollments cleared."}


# ──────────────────────────────────────────────
# WebSocket /ws/status — Live status stream
# ──────────────────────────────────────────────

@app.websocket("/ws/status")
async def websocket_status(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    try:
        # Send initial status
        status = await get_status()
        await ws.send_text(json.dumps({"type": "initial_status", **status}))

        # Keep alive — listen for close
        while True:
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Send heartbeat
                await ws.send_text(json.dumps({"type": "heartbeat"}))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if ws in ws_clients:
            ws_clients.remove(ws)


# ──────────────────────────────────────────────
# GET /system — Hardware stats (CPU / RAM / GPU)
# ──────────────────────────────────────────────

@app.get("/system")
async def get_system_stats():
    import psutil
    import platform

    # CPU
    cpu_percent = psutil.cpu_percent(interval=0.3)
    cpu_count = psutil.cpu_count(logical=True)
    cpu_freq = psutil.cpu_freq()
    cpu_freq_mhz = round(cpu_freq.current, 0) if cpu_freq else None

    # RAM
    mem = psutil.virtual_memory()
    ram_total_gb = round(mem.total / (1024 ** 3), 1)
    ram_used_gb = round(mem.used / (1024 ** 3), 1)
    ram_percent = mem.percent

    # GPU
    gpu_info = None
    try:
        import subprocess
        # Get GPU info using nvidia-smi
        # Format: Name, Total VRAM (MiB), Used VRAM (MiB)
        query = "nvidia-smi --query-gpu=gpu_name,memory.total,memory.used --format=csv,noheader,nounits"
        output = subprocess.check_output(query.split(), stderr=subprocess.STDOUT, text=True).strip()
        
        if output:
            # Assuming single GPU for now (split by newline and take first)
            first_gpu = output.split('\n')[0].split(',')
            if len(first_gpu) == 3:
                name = first_gpu[0].strip()
                # nvidia-smi returns MiB. Convert to GB.
                vram_total_mb = float(first_gpu[1].strip())
                vram_used_mb = float(first_gpu[2].strip())
                
                vram_total_gb = round(vram_total_mb / 1024, 1)
                vram_used_gb = round(vram_used_mb / 1024, 2)
                vram_percent = round((vram_used_mb / vram_total_mb) * 100, 1) if vram_total_mb > 0 else 0
                
                gpu_info = {
                    "name": name,
                    "vram_total_gb": vram_total_gb,
                    # Fallback properties to match what frontend expects
                    "vram_allocated_gb": vram_used_gb,
                    "vram_reserved_gb": vram_used_gb,
                    "vram_percent": vram_percent,
                }
    except Exception:
        pass

    return {
        "cpu": {
            "percent": cpu_percent,
            "cores": cpu_count,
            "freq_mhz": cpu_freq_mhz,
        },
        "ram": {
            "total_gb": ram_total_gb,
            "used_gb": ram_used_gb,
            "percent": ram_percent,
        },
        "gpu": gpu_info,
        "platform": platform.system(),
    }


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    printf("\n" + "=" * 70, Colors.HEADER)
    printf(" EchoVault — FastAPI Backend Server ", Colors.BOLD)
    printf("=" * 70 + "\n", Colors.HEADER)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")

