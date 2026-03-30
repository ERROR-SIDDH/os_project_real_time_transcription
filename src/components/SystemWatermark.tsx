'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, MemoryStick, Monitor } from 'lucide-react';

interface SystemStats {
    cpu: { percent: number; cores: number; freq_mhz: number | null };
    ram: { total_gb: number; used_gb: number; percent: number };
    gpu: {
        name: string;
        vram_total_gb: number;
        vram_allocated_gb: number;
        vram_reserved_gb: number;
        vram_percent: number;
    } | null;
    platform: string;
}

const BACKEND_URL_KEY = 'echovault_backend_url';

function getBackendUrl(): string {
    if (typeof window !== 'undefined') {
        return localStorage.getItem(BACKEND_URL_KEY) || 'http://localhost:8000';
    }
    return 'http://localhost:8000';
}

export function SystemWatermark() {
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [connected, setConnected] = useState(false);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${getBackendUrl()}/system`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
                setConnected(true);
            } else {
                setConnected(false);
            }
        } catch {
            setConnected(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 2000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    if (!connected || !stats) {
        return (
            <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 pointer-events-none select-none">
                <div className="bg-background/30 backdrop-blur-sm border-l border-t border-b border-border/20 rounded-l-xl px-3 py-4 text-[10px] text-muted-foreground/30 font-mono tracking-wider">
                    <p className="writing-mode-vertical" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
                        SYSTEM OFFLINE
                    </p>
                </div>
            </div>
        );
    }

    const cpuColor = stats.cpu.percent > 80 ? 'text-red-400' : stats.cpu.percent > 50 ? 'text-yellow-400' : 'text-emerald-400';
    const ramColor = stats.ram.percent > 80 ? 'text-red-400' : stats.ram.percent > 50 ? 'text-yellow-400' : 'text-emerald-400';
    const gpuColor = stats.gpu
        ? stats.gpu.vram_percent > 80
            ? 'text-red-400'
            : stats.gpu.vram_percent > 50
                ? 'text-yellow-400'
                : 'text-emerald-400'
        : 'text-muted-foreground/40';

    return (
        <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40 pointer-events-none select-none">
            <div className="bg-background/40 backdrop-blur-md border-l border-t border-b border-border/20 rounded-l-2xl px-2.5 py-4 space-y-4 shadow-xl">
                {/* CPU */}
                <div className="flex flex-col items-center gap-1">
                    <Cpu className={`h-3.5 w-3.5 ${cpuColor}`} />
                    <div className="relative w-1.5 h-12 bg-muted/40 rounded-full overflow-hidden">
                        <div
                            className={`absolute bottom-0 w-full rounded-full transition-all duration-500 ${stats.cpu.percent > 80 ? 'bg-red-400' : stats.cpu.percent > 50 ? 'bg-yellow-400' : 'bg-emerald-400'
                                }`}
                            style={{ height: `${stats.cpu.percent}%` }}
                        />
                    </div>
                    <span className={`text-[9px] font-mono tabular-nums ${cpuColor}`}>
                        {Math.round(stats.cpu.percent)}%
                    </span>
                    <span className="text-[8px] text-muted-foreground/40 font-mono">CPU</span>
                </div>

                {/* RAM */}
                <div className="flex flex-col items-center gap-1">
                    <MemoryStick className={`h-3.5 w-3.5 ${ramColor}`} />
                    <div className="relative w-1.5 h-12 bg-muted/40 rounded-full overflow-hidden">
                        <div
                            className={`absolute bottom-0 w-full rounded-full transition-all duration-500 ${stats.ram.percent > 80 ? 'bg-red-400' : stats.ram.percent > 50 ? 'bg-yellow-400' : 'bg-emerald-400'
                                }`}
                            style={{ height: `${stats.ram.percent}%` }}
                        />
                    </div>
                    <span className={`text-[9px] font-mono tabular-nums ${ramColor}`}>
                        {stats.ram.used_gb}G
                    </span>
                    <span className="text-[8px] text-muted-foreground/40 font-mono">RAM</span>
                </div>

                {/* GPU */}
                <div className="flex flex-col items-center gap-1">
                    <Monitor className={`h-3.5 w-3.5 ${gpuColor}`} />
                    <div className="relative w-1.5 h-12 bg-muted/40 rounded-full overflow-hidden">
                        <div
                            className={`absolute bottom-0 w-full rounded-full transition-all duration-500 ${!stats.gpu
                                    ? 'bg-muted-foreground/20'
                                    : stats.gpu.vram_percent > 80
                                        ? 'bg-red-400'
                                        : stats.gpu.vram_percent > 50
                                            ? 'bg-yellow-400'
                                            : 'bg-emerald-400'
                                }`}
                            style={{ height: `${stats.gpu ? stats.gpu.vram_percent : 0}%` }}
                        />
                    </div>
                    <span className={`text-[9px] font-mono tabular-nums ${gpuColor}`}>
                        {stats.gpu ? `${stats.gpu.vram_reserved_gb}G` : '—'}
                    </span>
                    <span className="text-[8px] text-muted-foreground/40 font-mono">GPU</span>
                </div>
            </div>
        </div>
    );
}
