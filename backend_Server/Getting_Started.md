# 🚀 Getting Started Guide

Follow these 5 simple steps to get the Real-Time Transcription & Diarization system running on your local machine.

---

### Step 1: Environment Preparation
Ensure you have a Python 3.10+ environment with CUDA 12.1 installed if you want GPU acceleration.
```bash
cd backend_Server
source .venv/bin/activate
# Install necessary drivers if not already present
pip install -r requirements.txt
```

### Step 2: Server & Room Configuration
Open the script and select **Option 1**. Enter the API Webhook URL for your frontend and a unique 6-digit Room ID to segregate your session.
> [!TIP]
> Use `http://localhost:9002/api/message` if running our standard Next.js frontend locally.

### Step 3: Model Initialization
Select **Option 2**. This will download and load the **Whisper** and **ECAPA-TDNN** models into your GPU VRAM (~2GB total). This may take a few minutes on the first run.

### Step 4: Speaker Enrollment (Recommended)
Before starting the meeting, select **Option 5**. Record **10-second samples** for each participant. This creates the ground-truth fingerprints used to identify users by name (e.g., "Alice") instead of generic IDs.

### Step 5: Start Transcribing
Select **Option 3**. The system will now:
1. Clear old audio segments.
2. Open the microphone stream.
3. Begin PUSHING real-time JSON payloads to your frontend!

---

### 🛑 To End the Session:
Press `Ctrl+C`. The system will automatically offer to generate an **AI Meeting Summary**. Press `y` to purge Whisper and load the **Qwen Micro-LLM** for a post-meeting chat.
