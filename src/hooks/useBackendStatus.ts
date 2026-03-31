'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface BackendStatus {
    connected: boolean;
    models_loaded: boolean;
    models_loading: boolean;
    is_recording: boolean;
    room_id: string | null;
    apiurl: string | null;
    whisper_model_size: string;
    input_device_index: number | null;
    input_device_name: string | null;
    device_compute: string;
    enrolled_speakers: string[];
    volume: number;
    transcript_count: number;
}

export interface AudioDevice {
    index: number;
    name: string;
    channels: number;
    is_default: boolean;
    is_selected: boolean;
}

const DEFAULT_STATUS: BackendStatus = {
    connected: false,
    models_loaded: false,
    models_loading: false,
    is_recording: false,
    room_id: null,
    apiurl: null,
    whisper_model_size: 'small',
    input_device_index: null,
    input_device_name: null,
    device_compute: 'cpu',
    enrolled_speakers: [],
    volume: 0,
    transcript_count: 0,
};

export function useBackendStatus(backendUrl: string) {
    const [status, setStatus] = useState<BackendStatus>(DEFAULT_STATUS);
    const [devices, setDevices] = useState<AudioDevice[]>([]);
    const [wsConnected, setWsConnected] = useState(false);
    const [testVolume, setTestVolume] = useState(0);
    const [llmStatus, setLlmStatus] = useState<{ status: string, message: string } | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fetch status via REST
    const fetchStatus = useCallback(async () => {
        if (!backendUrl) return;
        try {
            const res = await fetch(`${backendUrl}/status`);
            if (res.ok) {
                const data = await res.json();
                setStatus({ ...data, connected: true });
            } else {
                setStatus((prev) => ({ ...prev, connected: false }));
            }
        } catch {
            setStatus((prev) => ({ ...prev, connected: false }));
        }
    }, [backendUrl]);

    // Fetch devices
    const fetchDevices = useCallback(async () => {
        if (!backendUrl) return;
        try {
            const res = await fetch(`${backendUrl}/devices`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) setDevices(data.devices);
            }
        } catch {
            // Silently fail
        }
    }, [backendUrl]);

    // WebSocket connection
    useEffect(() => {
        if (!backendUrl) return;

        const wsUrl = backendUrl.replace(/^http/, 'ws') + '/ws/status';
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setWsConnected(true);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'initial_status') {
                    setStatus({ ...data, connected: true });
                } else if (data.type === 'status') {
                    setStatus((prev) => ({ ...prev, ...data, connected: true }));
                } else if (data.type === 'volume') {
                    setStatus((prev) => ({ ...prev, volume: data.level }));
                } else if (data.type === 'test_volume') {
                    setTestVolume(data.level);
                } else if (data.type === 'llm_status') {
                    setLlmStatus({ status: data.status, message: data.message });
                }
            } catch {
                // Ignore parse errors
            }
        };

        ws.onclose = () => {
            setWsConnected(false);
        };

        ws.onerror = () => {
            setWsConnected(false);
        };

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, [backendUrl]);

    // Polling fallback (every 3s)
    useEffect(() => {
        fetchStatus();
        fetchDevices();
        pollRef.current = setInterval(() => {
            fetchStatus();
        }, 3000);

        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [fetchStatus, fetchDevices]);

    // API call helpers
    const updateConfig = useCallback(
        async (config: { apiurl?: string; room_id?: string; whisper_model_size?: string }) => {
            const res = await fetch(`${backendUrl}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            const data = await res.json();
            if (data.success) await fetchStatus();
            return data;
        },
        [backendUrl, fetchStatus]
    );

    const loadModels = useCallback(async () => {
        const res = await fetch(`${backendUrl}/models/load`, { method: 'POST' });
        return await res.json();
    }, [backendUrl]);

    const unloadModels = useCallback(async () => {
        const res = await fetch(`${backendUrl}/models/unload`, { method: 'POST' });
        const data = await res.json();
        if (data.success) await fetchStatus();
        return data;
    }, [backendUrl, fetchStatus]);

    const selectDevice = useCallback(
        async (deviceIndex: number) => {
            const res = await fetch(`${backendUrl}/devices/select`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_index: deviceIndex }),
            });
            const data = await res.json();
            if (data.success) {
                await fetchStatus();
                await fetchDevices();
            }
            return data;
        },
        [backendUrl, fetchStatus, fetchDevices]
    );

    const testDevice = useCallback(async () => {
        setTestVolume(0);
        const res = await fetch(`${backendUrl}/devices/test`, { method: 'POST' });
        const data = await res.json();
        setTimeout(() => setTestVolume(0), 1000); // clear volume level after test finishes
        return data;
    }, [backendUrl]);

    const enrollSpeaker = useCallback(
        async (speakerName: string, durationSeconds: number = 10) => {
            const res = await fetch(`${backendUrl}/enroll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ speaker_name: speakerName, duration_seconds: durationSeconds }),
            });
            const data = await res.json();
            if (data.success) await fetchStatus();
            return data;
        },
        [backendUrl, fetchStatus]
    );

    const resetSpeakers = useCallback(async () => {
        const res = await fetch(`${backendUrl}/speakers/reset`, { method: 'POST' });
        const data = await res.json();
        if (data.success) await fetchStatus();
        return data;
    }, [backendUrl, fetchStatus]);

    const startTranscription = useCallback(async () => {
        const res = await fetch(`${backendUrl}/transcription/start`, { method: 'POST' });
        const data = await res.json();
        if (data.success) await fetchStatus();
        return data;
    }, [backendUrl, fetchStatus]);

    const stopTranscription = useCallback(async () => {
        const res = await fetch(`${backendUrl}/transcription/stop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ generate_summary: false }),
        });
        const data = await res.json();
        if (data.success) await fetchStatus();
        return data;
    }, [backendUrl, fetchStatus]);

    return {
        status,
        devices,
        wsConnected,
        testVolume,
        llmStatus,
        fetchStatus,
        fetchDevices,
        updateConfig,
        loadModels,
        unloadModels,
        selectDevice,
        testDevice,
        enrollSpeaker,
        resetSpeakers,
        startTranscription,
        stopTranscription,
    };
}
