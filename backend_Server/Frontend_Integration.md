# Real-Time Transcription Backend & Webhook Integration

This document outlines the exact network behavior our Python transcription backend uses to communicate with external frontends (such as a Next.js web app). It is designed to act as a clear spec sheet for the Frontend Engineer building the receiving API route.

---

## The Core Concept
The Python backend **does not** run a traditional REST server that the frontend pulls from. Instead, the Python backend acts as a **Client**. 

It continuously processes live microphone audio and **PUSHES** (HTTP POST) the transcribed text dynamically to a webhook URL hosted by your frontend server.

### 1. Webhook Endpoint Requirements
Your frontend must expose an arbitrary POST endpoint. (e.g., `POST http://localhost:9002/api/message`)

This URL is simply placed into the Python backend's `config.json` script on startup so it knows where to send the data.

### 2. The HTTP Request Layout

Whenever the Python backend successfully transcribes a person speaking in the room, it immediately fires the following HTTP Request to your configured frontend route:

**Method:** `POST`  
**Content-Type:** `application/json`  

**Example JSON Payload:**
```json
{
  "room_id": "111111",
  "message": "Alright, so I definitely think we should go with option B.",
  "speaker": "SPEAKER_00"
}
```

### 3. Payload Definitions
- `"room_id"` (String): A 6-character identifier (e.g., `"111111"`) inputted when starting the backend. Use this on your frontend database or WebSocket router to ensure this chat message gets rendered in the correct virtual room UI.
- `"message"` (String): The exact English phrase transcribed by the Whisper AI model. This has been scrubbed of whitespace and will only transmit if the user actually spoke.
- `"speaker"` (String): The Voice Profile of who spoke the `message`. 
    - **Default output:** `"SPEAKER_00"` or `"SPEAKER_01"`.
    - **If Voice Enrollment is used:** If the user registered names on the backend script before starting, this will pass exact strings like `"Alice"` or `"Bob"`.

### 4. How to Handle This Data
As a Frontend Engineer, you simply need to write an API route (`app/api/message/route.ts` if using Next.js App Router).

When your route receives the POST payload:
1. Parse the JSON body.
2. Filter the incoming data by the `room_id`.
3. Broadcast the `message` to your connected React clients using WebSockets, Pusher, or Socket.io.
4. Render the incoming message on your User Interface, using the `speaker` key to determine if the chat bubble should be placed on the left side or the right side!

---

## 5. POST-MEETING: AI Summary Payload
Once the meeting ends and the user starts the AI chat summary, the backend will send its responses (summaries, suggested actions, Q&A) to the same webhook.

**Payload Format:**
```json
{
  "room_id": "111111",
  "message": "AI Generated Answer or Meeting Summary.",
  "speaker": "Meeting AI"
}
```

Frontend developers can use this unique `speaker` string to style AI responses differently (e.g., centered, distinct colors, or in a persistent 'Meeting Notes' sidebar).

---

## 6. THE FINAL SUMMARY REPORT
When the meeting ends and the AI finishes generating the initial meeting summary, the backend sends a **Final Summary Report**. 

This is the most critical request for the frontend, as it contains the **Complete Meeting History** and the **AI Summary** in a single structured JSON object.

**Method:** `POST`  
**Payload Format:**
```json
{
  "room_id": "111111",
  "speaker": "SUMMARY_REPORT",
  "message": "AI Generated Meeting Summary String...",
  "full_transcript": [
    "[Alice] Hello everyone.",
    "[Bob] Let's begin the meeting.",
    "..."
  ]
}
```

### Purpose of this Report:
Your Frontend Engineer can use this `SUMMARY_REPORT` to:
1.  **Save the Meeting:** Immediately save the entire `full_transcript` array to a database (MongoDB/SQL).
2.  **Display Final Notes:** Show the `message` (the summary) in a highlight box at the end of the chat history.
3.  **PDF Generation:** Use the full data to generate a downloadable meeting document.
