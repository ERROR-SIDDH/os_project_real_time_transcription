'use client';

import React, { useState } from 'react';
import { useBackendStatus } from '@/hooks/useBackendStatus';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
    Wifi,
    WifiOff,
    Cpu,
    Mic,
    MicOff,
    Play,
    Square,
    Loader2,
    Download,
    Trash2,
    Settings,
    Activity,
    User,
    Radio,
    CheckCircle2,
    XCircle,
    Volume2,
    Zap,
} from 'lucide-react';

const BACKEND_URL_KEY = 'echovault_backend_url';

function getDefaultBackendUrl(): string {
    if (typeof window !== 'undefined') {
        return localStorage.getItem(BACKEND_URL_KEY) || 'http://localhost:8000';
    }
    return 'http://localhost:8000';
}

export function BackendControl() {
    const [backendUrl, setBackendUrl] = useState(getDefaultBackendUrl);
    const [urlInput, setUrlInput] = useState(backendUrl);

    // Config form state
    const [roomIdInput, setRoomIdInput] = useState('');
    const [modelSize, setModelSize] = useState('small');
    const [apiUrlInput, setApiUrlInput] = useState('');

    // Enrollment state
    const [enrollName, setEnrollName] = useState('');
    const [enrolling, setEnrolling] = useState(false);
    const [enrollProgress, setEnrollProgress] = useState(0);

    // Mic test state
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ avg_volume: number; max_volume: number } | null>(null);

    const { toast } = useToast();

    const {
        status,
        devices,
        wsConnected,
        testVolume,
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
    } = useBackendStatus(backendUrl);

    // ── Connection ──
    const handleConnect = () => {
        const url = urlInput.replace(/\/+$/, '');
        setBackendUrl(url);
        if (typeof window !== 'undefined') {
            localStorage.setItem(BACKEND_URL_KEY, url);
        }
        toast({ title: 'Backend URL updated', description: url });
    };

    // ── Config ──
    const handleSaveConfig = async () => {
        const config: Record<string, string> = {};
        if (roomIdInput) config.room_id = roomIdInput;
        if (modelSize) config.whisper_model_size = modelSize;
        if (apiUrlInput) config.apiurl = apiUrlInput;

        try {
            const res = await updateConfig(config);
            if (res.success) {
                toast({ title: 'Configuration saved' });
            } else {
                toast({ variant: 'destructive', title: 'Error', description: res.message });
            }
        } catch {
            toast({ variant: 'destructive', title: 'Failed to save config' });
        }
    };

    // ── Models ──
    const handleLoadModels = async () => {
        try {
            const res = await loadModels();
            toast({
                title: res.success ? 'Model loading started' : 'Error',
                description: res.message,
                variant: res.success ? 'default' : 'destructive',
            });
        } catch {
            toast({ variant: 'destructive', title: 'Failed to load models' });
        }
    };

    const handleUnloadModels = async () => {
        try {
            const res = await unloadModels();
            toast({
                title: res.success ? 'Models unloaded' : 'Error',
                description: res.message,
                variant: res.success ? 'default' : 'destructive',
            });
        } catch {
            toast({ variant: 'destructive', title: 'Failed to unload models' });
        }
    };

    // ── Devices ──
    const handleSelectDevice = async (val: string) => {
        try {
            const res = await selectDevice(parseInt(val));
            if (res.success) {
                toast({ title: 'Device selected', description: res.message });
            }
        } catch {
            toast({ variant: 'destructive', title: 'Failed to select device' });
        }
    };

    const handleTestDevice = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await testDevice();
            if (res.success) {
                setTestResult({ avg_volume: res.avg_volume, max_volume: res.max_volume });
                toast({ title: 'Mic test complete', description: `Avg: ${res.avg_volume}, Peak: ${res.max_volume}` });
            } else {
                toast({ variant: 'destructive', title: 'Test failed', description: res.message });
            }
        } catch {
            toast({ variant: 'destructive', title: 'Test failed' });
        } finally {
            setTesting(false);
        }
    };

    // ── Enrollment ──
    const handleEnroll = async () => {
        if (!enrollName.trim()) {
            toast({ variant: 'destructive', title: 'Enter a speaker name' });
            return;
        }
        setEnrolling(true);
        setEnrollProgress(0);

        // Simulate progress (10s recording)
        const interval = setInterval(() => {
            setEnrollProgress((p) => Math.min(p + 10, 95));
        }, 1000);

        try {
            const res = await enrollSpeaker(enrollName.trim());
            clearInterval(interval);
            setEnrollProgress(100);

            if (res.success) {
                toast({ title: 'Speaker enrolled', description: res.message });
                setEnrollName('');
            } else {
                toast({ variant: 'destructive', title: 'Enrollment failed', description: res.message });
            }
        } catch {
            clearInterval(interval);
            toast({ variant: 'destructive', title: 'Enrollment failed' });
        } finally {
            setTimeout(() => {
                setEnrolling(false);
                setEnrollProgress(0);
            }, 500);
        }
    };

    const handleResetSpeakers = async () => {
        try {
            const res = await resetSpeakers();
            if (res.success) {
                toast({ title: 'Speakers reset' });
            }
        } catch {
            toast({ variant: 'destructive', title: 'Failed to reset speakers' });
        }
    };

    // ── Transcription ──
    const handleStartTranscription = async () => {
        try {
            const res = await startTranscription();
            toast({
                title: res.success ? 'Transcription started' : 'Error',
                description: res.message,
                variant: res.success ? 'default' : 'destructive',
            });
        } catch {
            toast({ variant: 'destructive', title: 'Failed to start transcription' });
        }
    };

    const handleStopTranscription = async () => {
        try {
            const res = await stopTranscription();
            toast({
                title: res.success ? 'Transcription stopped' : 'Error',
                description: res.message,
                variant: res.success ? 'default' : 'destructive',
            });
        } catch {
            toast({ variant: 'destructive', title: 'Failed to stop transcription' });
        }
    };

    // ── Volume bar helpers ──
    const volumePercent = Math.min(status.volume * 2, 100);

    return (
        <div className="w-full space-y-6">
            {/* ═══════════════ CONNECTION ═══════════════ */}
            <Card className="shadow-lg border-border/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-headline flex items-center gap-2">
                            {status.connected ? (
                                <Wifi className="h-5 w-5 text-emerald-400" />
                            ) : (
                                <WifiOff className="h-5 w-5 text-destructive" />
                            )}
                            Backend Connection
                        </CardTitle>
                        <Badge
                            variant={status.connected ? 'default' : 'destructive'}
                            className={status.connected
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : ''}
                        >
                            {status.connected ? 'Connected' : 'Disconnected'}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-2">
                        <Input
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            placeholder="http://localhost:8000"
                            className="font-mono text-sm"
                        />
                        <Button onClick={handleConnect} variant="outline" className="shrink-0">
                            Connect
                        </Button>
                    </div>
                    {wsConnected && (
                        <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                            <Activity className="h-3 w-3" /> WebSocket live stream active
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* ═══════════════ CONFIGURATION ═══════════════ */}
            <Card className="shadow-lg border-border/50">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-headline flex items-center gap-2">
                        <Settings className="h-5 w-5 text-accent" />
                        Configuration
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground">Room ID</label>
                            <Input
                                value={roomIdInput}
                                onChange={(e) => setRoomIdInput(e.target.value)}
                                placeholder={status.room_id || '6-digit room ID'}
                                maxLength={6}
                                className="font-mono"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-muted-foreground">Whisper Model</label>
                            <Select value={modelSize} onValueChange={setModelSize}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="tiny">Tiny (fastest)</SelectItem>
                                    <SelectItem value="small">Small (balanced)</SelectItem>
                                    <SelectItem value="medium">Medium (accurate)</SelectItem>
                                    <SelectItem value="large">Large (best quality)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-muted-foreground">Frontend Webhook URL</label>
                        <Input
                            value={apiUrlInput}
                            onChange={(e) => setApiUrlInput(e.target.value)}
                            placeholder={status.apiurl || 'http://localhost:9002/api/message'}
                            className="font-mono text-sm"
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground space-y-0.5">
                            {status.room_id && <p>Current Room: <span className="font-mono text-accent">{status.room_id}</span></p>}
                            {status.apiurl && <p>Current Webhook: <span className="font-mono">{status.apiurl}</span></p>}
                        </div>
                        <Button onClick={handleSaveConfig} disabled={!status.connected} size="sm">
                            Save Config
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* ═══════════════ AI MODELS ═══════════════ */}
            <Card className="shadow-lg border-border/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-headline flex items-center gap-2">
                            <Cpu className="h-5 w-5 text-accent" />
                            AI Models
                        </CardTitle>
                        <Badge
                            variant="outline"
                            className={
                                status.models_loaded
                                    ? 'border-emerald-500/50 text-emerald-400'
                                    : status.models_loading
                                        ? 'border-yellow-500/50 text-yellow-400'
                                        : 'border-muted-foreground/30 text-muted-foreground'
                            }
                        >
                            {status.models_loaded
                                ? '✓ Loaded'
                                : status.models_loading
                                    ? 'Loading...'
                                    : 'Not Loaded'}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {status.models_loading && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-yellow-400 text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading Whisper ({status.whisper_model_size}) + ECAPA-TDNN... This may take a few minutes.
                            </div>
                            <Progress value={undefined} className="h-1.5" />
                        </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Zap className="h-3.5 w-3.5" />
                        Compute: <span className="font-mono uppercase">{status.device_compute}</span>
                        {status.whisper_model_size && (
                            <>
                                <span className="mx-1">•</span> Model: <span className="font-mono">{status.whisper_model_size}</span>
                            </>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            onClick={handleLoadModels}
                            disabled={!status.connected || status.models_loaded || status.models_loading}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                        >
                            {status.models_loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <Download className="h-4 w-4 mr-2" />
                            )}
                            Load Models
                        </Button>
                        <Button
                            onClick={handleUnloadModels}
                            disabled={!status.connected || !status.models_loaded || status.is_recording}
                            variant="outline"
                            className="flex-1"
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Unload
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* ═══════════════ MICROPHONE ═══════════════ */}
            <Card className="shadow-lg border-border/50">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-headline flex items-center gap-2">
                        <Mic className="h-5 w-5 text-accent" />
                        Microphone
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-2">
                        <Select
                            value={status.input_device_index?.toString() ?? ''}
                            onValueChange={handleSelectDevice}
                        >
                            <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Select audio input device" />
                            </SelectTrigger>
                            <SelectContent>
                                {devices.map((dev) => (
                                    <SelectItem key={dev.index} value={dev.index.toString()}>
                                        {dev.name} {dev.is_default ? '(Default)' : ''} — {dev.channels}ch
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button onClick={() => fetchDevices()} variant="outline" size="icon" className="shrink-0">
                            <Activity className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                            <Button
                                onClick={handleTestDevice}
                                disabled={!status.connected || testing}
                                variant="outline"
                                size="sm"
                            >
                                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Volume2 className="h-4 w-4 mr-1" />}
                                Test Mic (3s)
                            </Button>
                            {!testing && testResult && (
                                <span className="text-xs text-muted-foreground">
                                    Avg: <span className="text-foreground font-mono">{testResult.avg_volume}</span>
                                    {' '}Peak: <span className="text-foreground font-mono">{testResult.max_volume}</span>
                                </span>
                            )}
                        </div>

                        {/* Live Test Volume Wave */}
                        {testing && (
                            <div className="h-2 w-full max-w-[200px] bg-muted rounded-full overflow-hidden mt-1">
                                <div
                                    className="h-full rounded-full transition-all duration-75 ease-out"
                                    style={{
                                        width: `${Math.min(testVolume * 2, 100)}%`,
                                        background: testVolume > 35
                                            ? 'linear-gradient(90deg, #22c55e, #ef4444)'
                                            : testVolume > 15
                                                ? 'linear-gradient(90deg, #22c55e, #eab308)'
                                                : '#22c55e',
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    {status.input_device_name && (
                        <p className="text-xs text-muted-foreground">
                            Active: <span className="text-foreground">{status.input_device_name}</span>
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* ═══════════════ SPEAKER ENROLLMENT ═══════════════ */}
            <Card className="shadow-lg border-border/50">
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-headline flex items-center gap-2">
                        <User className="h-5 w-5 text-accent" />
                        Speaker Enrollment
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                        Record a 10-second voice sample on the backend microphone to register a speaker profile.
                    </p>
                    <div className="flex gap-2">
                        <Input
                            value={enrollName}
                            onChange={(e) => setEnrollName(e.target.value)}
                            placeholder="Speaker name (e.g. Alice)"
                            disabled={enrolling}
                        />
                        <Button
                            onClick={handleEnroll}
                            disabled={!status.connected || !status.models_loaded || enrolling || !enrollName.trim()}
                            className="shrink-0"
                        >
                            {enrolling ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                                <Mic className="h-4 w-4 mr-1" />
                            )}
                            Enroll
                        </Button>
                    </div>

                    {enrolling && (
                        <div className="space-y-1">
                            <p className="text-xs text-yellow-400">Recording... Speak now into the backend microphone.</p>
                            <Progress value={enrollProgress} className="h-1.5" />
                        </div>
                    )}

                    {status.enrolled_speakers.length > 0 && (
                        <div className="space-y-2">
                            <Separator />
                            <div className="flex items-center justify-between">
                                <div className="flex flex-wrap gap-1.5">
                                    {status.enrolled_speakers.map((name, i) => (
                                        <Badge key={i} variant="secondary" className="text-xs">
                                            <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" />
                                            {name}
                                        </Badge>
                                    ))}
                                </div>
                                <Button onClick={handleResetSpeakers} variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Reset
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* ═══════════════ TRANSCRIPTION CONTROL ═══════════════ */}
            <Card className={`shadow-lg border-border/50 ${status.is_recording ? 'ring-2 ring-red-500/30' : ''}`}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg font-headline flex items-center gap-2">
                            <Radio className={`h-5 w-5 ${status.is_recording ? 'text-red-400 animate-pulse' : 'text-accent'}`} />
                            Transcription
                        </CardTitle>
                        {status.is_recording && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse">
                                ● LIVE
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Volume Meter */}
                    {status.is_recording && (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <Volume2 className="h-3.5 w-3.5" /> Volume Level
                                </span>
                                <span className="font-mono">{status.volume.toFixed(1)}</span>
                            </div>
                            <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-100 ease-out"
                                    style={{
                                        width: `${volumePercent}%`,
                                        background: volumePercent > 70
                                            ? 'linear-gradient(90deg, #22c55e, #ef4444)'
                                            : volumePercent > 30
                                                ? 'linear-gradient(90deg, #22c55e, #eab308)'
                                                : '#22c55e',
                                    }}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Transcribed Segments: <span className="font-mono text-foreground">{status.transcript_count}</span>
                            </p>
                        </div>
                    )}

                    {/* Status Checklist */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                            {status.models_loaded ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className={status.models_loaded ? 'text-foreground' : 'text-muted-foreground'}>Models loaded</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {status.room_id ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className={status.room_id ? 'text-foreground' : 'text-muted-foreground'}>Room configured</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {status.apiurl ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className={status.apiurl ? 'text-foreground' : 'text-muted-foreground'}>Webhook set</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            {status.enrolled_speakers.length > 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className={status.enrolled_speakers.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>Speakers enrolled</span>
                        </div>
                    </div>

                    {/* Start / Stop */}
                    {!status.is_recording ? (
                        <Button
                            onClick={handleStartTranscription}
                            disabled={!status.connected || !status.models_loaded || !status.room_id || !status.apiurl}
                            className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700"
                            size="lg"
                        >
                            <Play className="h-5 w-5 mr-2" />
                            Start Transcribing
                        </Button>
                    ) : (
                        <Button
                            onClick={handleStopTranscription}
                            className="w-full h-12 text-base bg-red-600 hover:bg-red-700"
                            size="lg"
                        >
                            <Square className="h-5 w-5 mr-2" />
                            Stop Transcribing
                        </Button>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
