#!/usr/bin/env python3

import os
import sys
import json
import queue
import requests
import sounddevice as sd
import numpy as np
import torch
import soundfile as sf
import threading
import time
import re
from collections import deque
from threading import Thread, Lock, Event

# ---- Color Output ----
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

# ---- Configuration Management ----
CONFIG_PATH = "config.json"
DEFAULT_CONFIG = {
    "apiurl": "",
    "room_id": "",
    "whisper_model_size": "small",
    "input_device_index": None
}

class CONFIG:
    apiurl = None
    room_id = None
    whisper_model_size = None
    input_device_index = None
    whispermodel = None
    speakermodel = None
    speaker_centroids = []
    speaker_names = []
    enrolled = False
    device = 'cuda' if torch.cuda.is_available() else 'cpu'

GLOBAL_TRANSCRIPT = []

def printf(text, color=Colors.ENDC):
    print('\r' + ' ' * 75 + '\r' + f"{color}{text}{Colors.ENDC}")

def load_saved_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r') as f:
                data = json.load(f)
                return data
        except Exception:
            return DEFAULT_CONFIG.copy()
    return DEFAULT_CONFIG.copy()

def save_config(apiurl, room_id, whisper_model_size, input_device_index=None):
    new_data = {
        "apiurl": apiurl,
        "room_id": room_id,
        "whisper_model_size": whisper_model_size,
        "input_device_index": input_device_index
    }
    with open(CONFIG_PATH, 'w') as f:
        json.dump(new_data, f, indent=2)

def setupserver():
    saved = load_saved_config()
    printf(f"{Colors.BOLD}API Configuration:{Colors.ENDC}", Colors.HEADER)
    printf(f"Loaded config: {saved}", Colors.OKCYAN)
    # Select/override API URL
    apiurl = input(f"Base API URL [{saved['apiurl']}]: ").strip()
    if not apiurl:
        apiurl = saved['apiurl']
    # Prompt for 6-letter room_id
    while True:
        room_id = input(f"Room ID (6 letters/numbers) [{saved['room_id']}]: ").strip()
        if not room_id:
            room_id = saved['room_id']
        if room_id and len(room_id) == 6 and re.match(r'^[A-Za-z0-9]{6}$', room_id):
            break
        printf("Room ID must be exactly 6 letters/numbers.", Colors.WARNING)
    # Select/override whisper model size
    model_size = input(f"Whisper model size (tiny/small/medium/large) [{saved['whisper_model_size']}]: ").strip()
    if not model_size:
        model_size = saved['whisper_model_size']
    # Save
    save_config(apiurl, room_id, model_size, getattr(CONFIG, 'input_device_index', None))
    CONFIG.apiurl = apiurl
    CONFIG.room_id = room_id
    CONFIG.whisper_model_size = model_size
    printf(f"Configured API: {CONFIG.apiurl}", Colors.OKGREEN)
    printf(f"room_id: {CONFIG.room_id}", Colors.OKBLUE)
    printf(f"whisper_model_size: {CONFIG.whisper_model_size}", Colors.OKCYAN)

def configure_microphone():
    printf(f"\n{Colors.BOLD}Microphone Configuration:{Colors.ENDC}", Colors.HEADER)
    try:
        devices = sd.query_devices()
        input_devices = []
        for i, dev in enumerate(devices):
            if dev['max_input_channels'] > 0:
                input_devices.append(i)
                default_str = " (Default)" if i == sd.default.device[0] else ""
                selected_str = " [*SELECTED*]" if getattr(CONFIG, 'input_device_index', None) == i else ""
                printf(f"[{i}] {dev['name']} (Channels: {dev['max_input_channels']}){default_str}{selected_str}", Colors.OKCYAN)
    except Exception as e:
        printf(f"Error querying audio devices: {e}", Colors.FAIL)
        return

    printf("Enter the device ID you want to use (or press enter to cancel):", Colors.BOLD)
    choice = input("Device ID > ").strip()
    if not choice:
        return
        
    try:
        dev_id = int(choice)
        if dev_id not in input_devices:
            printf("Invalid device ID or not an input device.", Colors.FAIL)
            return
            
        CONFIG.input_device_index = dev_id
        save_config(CONFIG.apiurl, CONFIG.room_id, CONFIG.whisper_model_size, CONFIG.input_device_index)
        printf(f"Saved input device: {devices[dev_id]['name']}", Colors.OKGREEN)
        
        test_mic = input("Do you want to test this microphone now? (y/N): ").strip().lower()
        if test_mic == 'y':
            test_microphone(dev_id)
    except ValueError:
        printf("Invalid input. Please enter a number.", Colors.FAIL)

def test_microphone(dev_id):
    printf("\nTesting microphone... Please speak into it for 3 seconds.", Colors.WARNING)
    try:
        recording = []
        def test_callback(indata, frames, time, status):
            recording.append(indata.copy())
            volume_norm = np.linalg.norm(indata) * 10
            bar = int(min(volume_norm, 50))
            meter = '█' * bar + '-' * (50 - bar)
            print('\r' + f"Vol: [{meter}] {volume_norm:.1f}   ", end='', flush=True)
            
        with sd.InputStream(device=dev_id, channels=1, samplerate=16000, callback=test_callback):
            sd.sleep(3000)
            
        print()
        if recording:
            audio_data = np.concatenate(recording, axis=0)
            printf("Playing back recorded audio...", Colors.OKCYAN)
            sd.play(audio_data, samplerate=16000)
            sd.wait()
            
        printf("Test complete.", Colors.OKGREEN)
    except Exception as e:
        print()
        printf(f"Failed to test microphone: {e}", Colors.FAIL)

# ---- Load Whisper Model ----
def loadmodels():
    printf("Loading Models...", Colors.BOLD)
    try:
        import whisper
        from dotenv import load_dotenv
        from speechbrain.inference.speaker import EncoderClassifier
    except ImportError:
        printf("Error: required modules not found", Colors.FAIL)
        printf("Please install: pip install openai-whisper python-dotenv speechbrain scikit-learn", Colors.WARNING)
        return
        
    load_dotenv()

    CONFIG.whispermodel = whisper.load_model(CONFIG.whisper_model_size, device=CONFIG.device)
    printf("Whisper model loaded successfully.", Colors.OKGREEN)
    
    printf("Loading SpeechBrain Voice Fingerprint Model...", Colors.OKCYAN)
    try:
        # ECAPA-TDNN runs very fast on CPU, saving precious VRAM
        CONFIG.speakermodel = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb", 
            savedir="pretrained_models/spkrec-ecapa-voxceleb", 
            run_opts={"device": "cpu"}
        )
        CONFIG.speaker_centroids = []
        printf("SpeechBrain Voice Tracker loaded successfully.", Colors.OKGREEN)
    except Exception as e:
        printf(f"Failed to load Voice Tracker: {e}", Colors.FAIL)
            
    printf(f"Using device: {CONFIG.device} for Whisper, CPU for Voice Tracking", Colors.OKGREEN)

def identify_speaker(audio_segment):
    if not getattr(CONFIG, 'speakermodel', None):
        return "SPEAKER_??"
        
    try:
        from sklearn.metrics.pairwise import cosine_similarity
        # Ensure we have a 1D tensor
        audio_tensor = torch.from_numpy(audio_segment).float()
        with torch.no_grad():
            emb = CONFIG.speakermodel.encode_batch(audio_tensor.unsqueeze(0))
            emb = emb.squeeze(0).squeeze(0).numpy()
            
        if getattr(CONFIG, 'enrolled', False) and len(CONFIG.speaker_centroids) >= 2:
            sims = cosine_similarity([emb], CONFIG.speaker_centroids)[0]
            speaker_idx = int(np.argmax(sims))
            return CONFIG.speaker_names[speaker_idx]
            
        if len(CONFIG.speaker_centroids) == 0:
            CONFIG.speaker_centroids.append(emb)
            return "SPEAKER_00"
        elif len(CONFIG.speaker_centroids) == 1:
            sim = cosine_similarity([emb], [CONFIG.speaker_centroids[0]])[0][0]
            if sim > 0.45: # Tuned for ECAPA-TDNN
                # Move centroid slightly towards this new sample (exponential moving average)
                CONFIG.speaker_centroids[0] = 0.9 * CONFIG.speaker_centroids[0] + 0.1 * emb
                return "SPEAKER_00"
            else:
                CONFIG.speaker_centroids.append(emb)
                return "SPEAKER_01"
        else:
            sims = cosine_similarity([emb], CONFIG.speaker_centroids)[0]
            speaker_idx = int(np.argmax(sims))
            if sims[speaker_idx] > 0.35:
                # Update matched centroid
                CONFIG.speaker_centroids[speaker_idx] = 0.9 * CONFIG.speaker_centroids[speaker_idx] + 0.1 * emb
            return f"SPEAKER_{speaker_idx:02d}"
    except Exception as e:
        printf(f"Fingerprinting error: {e}", Colors.FAIL)
        return "SPEAKER_??"

# ---- Audio & Threading Setup ----
SAMPLERATE = 16000
CHUNKDURATION = 3  # seconds
OUTPUTDIR = "segments"
os.makedirs(OUTPUTDIR, exist_ok=True)

audioq = queue.Queue()
processingq = queue.Queue(maxsize=20)
apiq = queue.Queue(maxsize=50)
stopevent = Event()
threadslist = []

def callback(indata, frames, time, status):
    if status:
        printf(f"Audio Status: {status}", Colors.WARNING)
    audioq.put(indata.copy())
    
    volume_norm = np.linalg.norm(indata) * 10
    bar = int(min(volume_norm, 50))
    meter = '█' * bar + '-' * (50 - bar)
    print('\r' + f"Vol: [{meter}] {volume_norm:.1f}   ", end='', flush=True)

def audiobufferingthread():
    printf("AUDIO Buffering thread started", Colors.OKGREEN)
    buffer = np.zeros(0, dtype=np.float32)
    device_idx = getattr(CONFIG, 'input_device_index', None)
    try:
        if device_idx is not None:
            deviceinfo = sd.query_devices(device_idx)
        else:
            deviceinfo = sd.query_devices(kind='input')
        printf(f"Using input device: {deviceinfo['name']}", Colors.OKCYAN)
    except Exception as e:
        printf(f"Error accessing microphone: {e}", Colors.FAIL)
        return
    try:
        with sd.InputStream(device=device_idx, samplerate=SAMPLERATE, channels=1, callback=callback):
            printf("Recording... Press Ctrl+C to stop.", Colors.OKGREEN)
            while not stopevent.is_set():
                try:
                    data = audioq.get(timeout=0.5)
                    buffer = np.concatenate([buffer, data.flatten()])
                    if len(buffer) >= SAMPLERATE * CHUNKDURATION:
                        chunk = buffer[:SAMPLERATE * CHUNKDURATION]
                        buffer = buffer[SAMPLERATE * CHUNKDURATION:]
                        try:
                            processingq.put_nowait(chunk)
                        except queue.Full:
                            printf("Processing queue full, skipping chunk", Colors.WARNING)
                except queue.Empty:
                    continue
                except KeyboardInterrupt:
                    printf("Recording stopped by user", Colors.WARNING)
                    stopevent.set()
                except Exception as e:
                    printf(f"Error in audio buffering: {e}", Colors.FAIL)
                    stopevent.set()
    except Exception as e:
        printf(f"Error opening audio input: {e}", Colors.FAIL)
        stopevent.set()

def processingthread():
    printf("PROCESS Processing thread started", Colors.OKGREEN)
    chunkcount = 0
    while not stopevent.is_set():
        try:
            chunk = processingq.get(timeout=1.0)
            chunkcount += 1
            filepath = os.path.join(OUTPUTDIR, f"temp_{chunkcount}.wav")
            sf.write(filepath, chunk, SAMPLERATE)
            try:
                result = CONFIG.whispermodel.transcribe(filepath, language="en", fp16=False)

                for segment in result.get('segments', []):
                    start_time = segment['start']
                    end_time = segment['end']
                    text = segment['text'].strip()
                    
                    if not text or len(text) < 3:
                        continue
                        
                    start_sample = int(start_time * SAMPLERATE)
                    end_sample = int(end_time * SAMPLERATE)
                    segment_audio = chunk[start_sample:end_sample]
                    
                    speaker_label = "SPEAKER_??"
                    # Require at least 0.5s of audio to get a reliable fingerprint
                    if len(segment_audio) > 8000:
                        speaker_label = identify_speaker(segment_audio)
                            
                    formatted_text = f"[{speaker_label}] {text}"
                    printf(f"Transcribed: {formatted_text}", Colors.OKCYAN)
                    GLOBAL_TRANSCRIPT.append(formatted_text)

                    apiq.put_nowait({
                        "room_id": CONFIG.room_id,
                        "message": text,
                        "speaker": speaker_label
                    })
            except Exception as e:
                printf(f"Error processing chunk: {e}", Colors.FAIL)
        except queue.Empty:
            continue
        except Exception as e:
            printf(f"Error in processing thread: {e}", Colors.FAIL)

def apisenderthread():
    printf("API Sender thread started", Colors.OKGREEN)
    while not stopevent.is_set():
        try:
            payload = apiq.get(timeout=1.0)
            sendtoapi(payload)
        except queue.Empty:
            continue
        except Exception as e:
            printf(f"Error in API sender thread: {e}", Colors.FAIL)

def sendtoapi(payload):
    if not CONFIG.apiurl or not CONFIG.room_id:
        printf("API URL or room_id not set, skipping API send.", Colors.WARNING)
        return
    try:
        response = requests.post(CONFIG.apiurl, json=payload, timeout=5)
        if response.ok:
            printf("Sent to server successfully.", Colors.OKGREEN)
        else:
            printf(f"Server error {response.status_code}: {response.text}", Colors.FAIL)
    except requests.exceptions.Timeout:
        printf("Request timeout", Colors.WARNING)
    except Exception as e:
        printf(f"Error sending to server: {e}", Colors.FAIL)

def cleanupthreads():
    printf("Stopping all threads...", Colors.WARNING)
    stopevent.set()
    for thread in threadslist:
        thread.join(timeout=5.0)
        if thread.is_alive():
            printf(f"Thread {thread.name} did not stop gracefully.", Colors.WARNING)
    printf("All threads stopped.", Colors.OKGREEN)

import glob

def starttranscribing():
    printf("Starting Multi-Threaded Transcription System", Colors.BOLD)
    
    # Clean up old audio segments to free disk space
    try:
        old_segments = glob.glob(os.path.join(OUTPUTDIR, "*.wav"))
        for f in old_segments:
            os.remove(f)
        if old_segments:
            printf(f"Cleared {len(old_segments)} previous audio chunks from memory.", Colors.OKCYAN)
    except Exception as e:
        printf(f"Warning: Could not clear old segments: {e}", Colors.WARNING)
        
    global threadslist, GLOBAL_TRANSCRIPT
    GLOBAL_TRANSCRIPT = []
    stopevent.clear()
    t1 = Thread(target=audiobufferingthread, name="AudioBuffer", daemon=False)
    t2 = Thread(target=processingthread, name="Processing", daemon=False)
    t3 = Thread(target=apisenderthread, name="APISender", daemon=False)
    threadslist = [t1, t2, t3]
    for thread in threadslist:
        thread.start()
    try:
        for thread in threadslist:
            thread.join()
    except KeyboardInterrupt:
        printf("Interrupt detected, cleaning up...", Colors.WARNING)
        cleanupthreads()
        post_meeting_chat()
    except Exception as e:
        printf(f"FATAL ERROR: {e}", Colors.FAIL)
        cleanupthreads()
        sys.exit(1)

def post_meeting_chat():
    global GLOBAL_TRANSCRIPT
    if not GLOBAL_TRANSCRIPT:
        return
        
    print()
    ans = input(f"{Colors.BOLD}Would you like to analyze this meeting's {len(GLOBAL_TRANSCRIPT)} messages with AI? (y/n): {Colors.ENDC}").strip().lower()
    if ans != 'y':
        return
        
    printf("Loading Qwen Micro-LLM... (This will securely purge Whisper from your GPU)", Colors.OKCYAN)
    
    # 1. Purge VRAM
    CONFIG.whispermodel = None
    import gc
    gc.collect()
    try:
        torch.cuda.empty_cache()
    except:
        pass
        
    # 2. Load LLM
    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer
        model_id = "Qwen/Qwen2.5-0.5B-Instruct"
        tokenizer = AutoTokenizer.from_pretrained(model_id)
        llm = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype=torch.float16, device_map="auto")
    except Exception as e:
        printf(f"Failed to load LLM: {e}", Colors.FAIL)
        return
        
    # 3. Chat loop
    transcript_text = "\\n".join(GLOBAL_TRANSCRIPT)
    system_prompt = f"You are an offline AI meeting assistant. The following is a raw transcript of the meeting you just attended. Use it to answer the user's questions accurately.\\n\\n[Meeting Transcript]\\n{transcript_text}\\n"
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    printf("\n--- AI Chat Active ---\n(Type 'exit' to return to Main Menu)", Colors.OKGREEN)
    
    # 3. Initial Auto-Summary & Full Context Sync
    printf("Generating initial meeting summary and syncing context...", Colors.OKCYAN)
    initial_q = "Please provide a concise summary of this meeting, including key decisions and action items."
    messages.append({"role": "user", "content": initial_q})
    
    try:
        text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer([text], return_tensors="pt").to(llm.device)
        outputs = llm.generate(**inputs, max_new_tokens=512, temperature=0.7)
        initial_summary = tokenizer.batch_decode(outputs[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0]
        
        print(f"{Colors.OKCYAN}Meeting Summary: {Colors.ENDC}{initial_summary}")
        messages.append({"role": "assistant", "content": initial_summary})
        
        # Send FINAL SUMMARY REPORT (with full context)
        sendtoapi({
            "room_id": CONFIG.room_id,
            "speaker": "SUMMARY_REPORT",
            "message": initial_summary,
            "full_transcript": GLOBAL_TRANSCRIPT
        })
    except Exception as e:
        printf(f"Failed to generate initial summary: {e}", Colors.FAIL)

    while True:
        try:
            user_q = input(f"{Colors.OKBLUE}You: {Colors.ENDC}").strip()
            if not user_q: continue
            if user_q.lower() in ['exit', 'quit']:
                break
                
            messages.append({"role": "user", "content": user_q})
            
            # Apply conversational template using Qwen's format seamlessly
            text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = tokenizer([text], return_tensors="pt").to(llm.device)
            
            outputs = llm.generate(**inputs, max_new_tokens=256, temperature=0.7)
            response = tokenizer.batch_decode(outputs[:, inputs.input_ids.shape[1]:], skip_special_tokens=True)[0]
            
            print(f"{Colors.OKCYAN}AI: {Colors.ENDC}{response}")
            messages.append({"role": "assistant", "content": response})
            
            # Send AI response to frontend
            sendtoapi({
                "room_id": CONFIG.room_id,
                "message": response,
                "speaker": "Meeting AI"
            })
            
        except KeyboardInterrupt:
            break
        except Exception as e:
            printf(f"Error generating response: {e}", Colors.FAIL)
            break
            
    # Purge LLM
    del llm
    del tokenizer
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    printf("Exiting chat and returning to main menu.", Colors.HEADER)
    printf("NOTE: You will need to select Option 2 to re-load Whisper if recording again.", Colors.WARNING)

def register_speakers():
    if getattr(CONFIG, 'speakermodel', None) is None:
        printf("Please load models first (option 2).", Colors.WARNING)
        return
        
    printf("\n--- Speaker Registration ---", Colors.HEADER)
    CONFIG.speaker_centroids = []
    CONFIG.speaker_names = []
    
    device_idx = getattr(CONFIG, 'input_device_index', None)
    
    for i in range(2):
        name = input(f"Enter Name for Speaker {i+1} [or press Enter for SPEAKER_{i:02d}]: ").strip()
        if not name:
            name = f"SPEAKER_{i:02d}"
            
        printf(f"Get ready to speak, {name}... Recording will start in 3 seconds.", Colors.WARNING)
        time.sleep(3)
        printf("Recording 10 seconds... Speak now!", Colors.OKGREEN)
        
        recording = []
        def rec_callback(indata, frames, t, status):
            recording.append(indata.copy())
            
        try:
            with sd.InputStream(device=device_idx, channels=1, samplerate=SAMPLERATE, callback=rec_callback):
                sd.sleep(10000)
                
            audio_data = np.concatenate(recording, axis=0).flatten()
            
            # Extract embedding
            audio_tensor = torch.from_numpy(audio_data).float()
            with torch.no_grad():
                emb = CONFIG.speakermodel.encode_batch(audio_tensor.unsqueeze(0))
                emb = emb.squeeze(0).squeeze(0).numpy()
                
            CONFIG.speaker_centroids.append(emb)
            CONFIG.speaker_names.append(name)
            printf(f"Successfully registered fingerprint for {name}.\n", Colors.OKCYAN)
        except Exception as e:
            printf(f"Failed to record audio for {name}: {e}", Colors.FAIL)
            return
            
    CONFIG.enrolled = True
    printf("Speaker registration complete! You can now start transcribing.", Colors.OKGREEN)

def menu():
    while True:
        printf("--- Main Menu ---", Colors.HEADER)
        print("1. Setup server URL & room_id")
        print("2. Load Whisper model")
        print("3. Start transcribing from microphone")
        print("4. Configure & Test Microphone")
        print("5. Enroll Speaker Profiles (Optional)")
        print("0. Exit")
        choice = input("choice > ").strip()
        if choice == "1":
            setupserver()
        elif choice == "2":
            loadmodels()
        elif choice == "3":
            if CONFIG.whispermodel is None:
                printf("Please load models first (option 2).", Colors.WARNING)
            else:
                starttranscribing()
        elif choice == "4":
            configure_microphone()
        elif choice == "5":
            register_speakers()
        elif choice == "0":
            printf("Exiting...", Colors.OKGREEN)
            cleanupthreads()
            sys.exit(0)
        else:
            printf("Invalid choice. Try again.", Colors.FAIL)

if __name__ == "__main__":
    printf("\n" + "="*70, Colors.HEADER)
    printf(" Real-Time Transcription System ", Colors.BOLD)
    printf("="*70 + "\n", Colors.HEADER)
    try:
        saved_cfg = load_saved_config()
        CONFIG.apiurl = saved_cfg.get('apiurl', '')
        CONFIG.room_id = saved_cfg.get('room_id', '')
        CONFIG.whisper_model_size = saved_cfg.get('whisper_model_size', 'small')
        CONFIG.input_device_index = saved_cfg.get('input_device_index', None)
        menu()
    except KeyboardInterrupt:
        printf("Application terminated by user", Colors.WARNING)
        cleanupthreads()
        sys.exit(0)
    except Exception as e:
        printf(f"FATAL ERROR: {e}", Colors.FAIL)
        cleanupthreads()
        sys.exit(1)
