'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageList } from './MessageList';
import { AIChatPanel } from './AIChatPanel';
import { useBackendStatus } from '@/hooks/useBackendStatus';
import { Loader2, ArrowRight, Sparkles } from 'lucide-react';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp"

export function Room() {
  const [roomIdInput, setRoomIdInput] = useState('');
  const [activeRoom, setActiveRoom] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // Grab backend url from localStorage
  const backendUrl = typeof window !== 'undefined' ? localStorage.getItem('echovault_backend_url') || 'http://localhost:8000' : 'http://localhost:8000';

  const { status, llmStatus } = useBackendStatus(backendUrl);

  useEffect(() => {
    if (activeRoom) {
      document.title = `Room: ${activeRoom}`;
    } else {
      document.title = 'EchoVault';
    }

    // Cleanup function to reset title when component unmounts or room changes
    return () => {
      document.title = 'EchoVault';
    };
  }, [activeRoom]);

  const handleJoinRoom = () => {
    if (!/^\d{6}$/.test(roomIdInput)) {
      setError('Room ID must be exactly 6 digits.');
      return;
    }
    setError(null);
    startTransition(() => {
      setActiveRoom(roomIdInput);
    });
  };

  const handleLeaveRoom = () => {
    setActiveRoom(null);
    setRoomIdInput('');
    setError(null);
    setShowAiPanel(false);
  }

  if (activeRoom) {
    return (
      <div className="flex flex-col lg:flex-row gap-6 items-start h-[calc(100vh-140px)]">
        {/* Main Transcript Area */}
        <div className={`flex-1 flex flex-col h-full transition-all duration-300 ${showAiPanel ? 'lg:w-2/3' : 'w-full'}`}>
          <div className="flex items-center justify-between mb-4">
            <Button variant="outline" onClick={handleLeaveRoom}>
              Leave Room
            </Button>

            <Button
              variant={showAiPanel ? "secondary" : "default"}
              onClick={() => setShowAiPanel(!showAiPanel)}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {showAiPanel ? 'Close AI Assistant' : 'AI Meeting Assistant'}
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <MessageList roomId={activeRoom} />
          </div>
        </div>

        {/* AI Assistant Panel */}
        {showAiPanel && (
          <div className="w-full lg:w-1/3 h-full animate-in slide-in-from-right-8 fade-in duration-300">
            <AIChatPanel
              backendUrl={backendUrl}
              llmStatus={llmStatus}
              transcribing={status.is_recording}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg">
      <CardHeader>
        <CardTitle className="text-center text-2xl font-headline">Join a Room</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col space-y-4 items-center">
          <div className="space-y-2">
            <label htmlFor="roomId" className="text-sm font-medium text-muted-foreground">
              Enter 6-digit Room ID
            </label>
            <InputOTP
              maxLength={6}
              value={roomIdInput}
              onChange={(value) => setRoomIdInput(value)}
              onComplete={handleJoinRoom}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>
          <Button
            onClick={handleJoinRoom}
            disabled={isPending || roomIdInput.length !== 6}
            className="w-full max-w-xs bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {isPending ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                Join Room <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
