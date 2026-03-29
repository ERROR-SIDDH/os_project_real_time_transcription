# Real-Time Transcription & Diarization System

## 1. System Overview

Our Real-Time Transcription Backend is a highly-optimized Python microservice. It is designed to stream live audio from a local microphone, buffer the data smoothly, transcribe spoken phrases using AI, and use Speaker Diarization mathematically to verify *who* is speaking in real-time.

The backend acts as a powerful data pipeline that feeds front-end dashboards (such as Next.js websites) via a REST Webhook API.

---

## 2. Full System Lifecycle Diagram

```mermaid
graph TD
    classDef hardware fill:#fbfdb5,stroke:#b87d00,stroke-width:2px,color:#000;
    classDef thread fill:#a3c4f3,stroke:#0f4c81,stroke-width:2px,color:#000;
    classDef data fill:#e5e5e5,stroke:#4d4d4d,stroke-width:2px,color:#000;
    classDef ai fill:#c1f0c1,stroke:#1d701d,stroke-width:2px,color:#000;
    classDef external fill:#ffd6e0,stroke:#8f1d35,stroke-width:3px,color:#000;

    subgraph Phase 1: Voice Enrollment
        E1[Speaker Registration Menu] ::: thread
        E2[(Voice Fingerprint Centroids)] ::: data
        E1 -->|5-sec Sample| E2
    end

    subgraph Phase 2: High-Speed Capture
        Mic([🎙️ Local Microphone Stream]) ::: hardware
        T1[Audio Buffering Thread] ::: thread
        Q1[(3-sec Chunk Queue)] ::: data

        Mic -->|16kHz PCM| T1
        T1 -->|Aggregates NumPy| Q1
    end

    subgraph Phase 3: AI Core Processing
        T2[AI Processing Thread] ::: thread
        W[Whisper Small Model] ::: ai
        S[ECAPA-TDNN Fingerprinter] ::: ai
        Align{Identity Aligner} ::: thread
        Q2[(API JSON Payload Queue)] ::: data

        Q1 -->|Dequeue| T2
        T2 -->|Transcription| W
        T2 -->|Voice Matching| S
        
        W -->|Text + Timings| Align
        S -->|Matched Name| Align
        E2 -.->|Reference| S
        
        Align -->|Package JSON| Q2
    end

    subgraph Phase 4: Post-Meeting AI
        T4[Qwen 0.5B Micro-LLM] ::: ai
        Q2 -->|Final POST| Web[[Next.js Frontend Webhook]] ::: external
        T4 -->|Auto-Summary| Web
    end
```

---

## 3. Technology Stack & Tools Used

| **Component** | **Technology Used** | **Purpose** |
| :--- | :--- | :--- |
| **Speech-To-Text AI** | `openai-whisper` | Converts frequencies to text phrases with precise timestamps. |
| **Voice Fingerprinting**| `ECAPA-TDNN` | Extracts 192-dimensional mathematical embeddings to identify unique speakers. |
| **Meeting Intelligence**| `Qwen2.5-0.5B` | A Micro-LLM that generates offline summaries and meeting notes after transcription. |
| **Hardware Compute** | CUDA 12.1 + `torch` | Hardware acceleration for the local deep learning models. |
| **Audio Capture** | `sounddevice`, `numpy` | High-fidelity local PCM capturing and chunking. |

---

## 4. System Hardware Requirements

To run this triple-AI pipeline locally in real-time, the following hardware specifications are recommended:

| **Component** | **Requirement** | **Details** |
| :--- | :--- | :--- |
| **GPU (Video RAM)** | **6GB VRAM** (Minimum) | Optimized for CUDA 12.1. Required to host Whisper and LLM concurrently. |
| **CPU** | **4+ Cores** | Handles audio buffering, Diarization, and API threading. |
| **System RAM** | **16GB** | Ensures smooth model swapping and OS stability. |
| **Storage** | **4GB Available** | For model weights (Whisper, ECAPA, Qwen) and temporary audio segments. |

---

## 5. Neural Network Model Statistics

| **Model Name** | **Architecture** | **Disk Size** | **VRAM Usage** |
| :--- | :--- | :--- | :--- |
| **Whisper (Small)** | Transformer (Encoder-Decoder)| ~460 MB | ~1.5 GB |
| **ECAPA-TDNN** | TDNN + Statistical Pooling | ~80 MB | ~200 MB |
| **Qwen-2.5-0.5B** | Autoregressive Causal LLM | ~1.1 GB | ~1.5 GB (Quantized) |

---

## 6. How It Works (Step-By-Step)

### A. Phase 1: Enrollment (Optional but Recommended)
The system starts by asking users to record a 10-second samples of their voice. This creates a "Ground Truth" mathematical fingerprint. Unlike older systems that guess who is speaking, this system compares live audio directly against these stored fingerprints to guarantee identity accuracy.

### B. Phase 2: Non-blocking Audio Buffer
The **Audio Buffering Thread** creates an 16,000Hz stream. It segments this stream into small 3-second blocks for near-instant transcription. These blocks are queued up in RAM to ensure zero data loss while the AI works.

### C. Phase 3: Identity Alignment
The **AI Processing Thread** takes each chunk and runs it through two neural networks simultaneously:
1. **Whisper** defines *what* was said and *when*.
2. **ECAPA-TDNN** defines *who* said it by comparing the voice against the Enrollment centroids.
The system then fuses these results into a single JSON object.

### D. Phase 4: Final Summary Sync
When the session is stopped (`Ctrl+C`), the backend purges the transcribing models to free up GPU memory. It then loads the **Qwen Micro-LLM**, summarizes the entire meeting history, and POSTs a final **Summary Report** (including the full transcript context) to your frontend for permanent storage.
