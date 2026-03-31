'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Sparkles, Send } from 'lucide-react';

interface AIChatPanelProps {
    backendUrl: string;
    llmStatus: { status: string; message: string } | null;
    transcribing: boolean;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

export function AIChatPanel({ backendUrl, llmStatus, transcribing }: AIChatPanelProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isSummarizing, setIsSummarizing] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, llmStatus]);

    const handleGenerateSummary = async () => {
        setIsSummarizing(true);
        setError(null);
        try {
            const res = await fetch(`${backendUrl}/chat/summarize`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setMessages([{ role: 'assistant', content: data.response }]);
            } else {
                setError(data.message || 'Failed to generate summary');
            }
        } catch (e: any) {
            setError(e.message || 'Error connecting to backend');
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isSending) return;

        const userMessage = inputValue.trim();
        setInputValue('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsSending(true);
        setError(null);

        try {
            const res = await fetch(`${backendUrl}/chat/message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: userMessage })
            });
            const data = await res.json();

            if (data.success) {
                setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
            } else {
                setError(data.message || 'Failed to send message');
                // Pop user message on failure
                setMessages(prev => prev.slice(0, -1));
            }
        } catch (e: any) {
            setError(e.message || 'Error connecting to backend');
            setMessages(prev => prev.slice(0, -1));
        } finally {
            setIsSending(false);
        }
    };

    // If no summary exists yet
    if (messages.length === 0) {
        return (
            <Card className="w-full shadow-lg border-primary/20">
                <CardContent className="pt-6">
                    <div className="flex flex-col items-center justify-center space-y-4 py-8 text-center">
                        <Sparkles className="h-12 w-12 text-primary/60" />
                        <div className="space-y-2 max-w-sm">
                            <h3 className="font-semibold text-lg">AI Meeting Assistant</h3>
                            <p className="text-sm text-muted-foreground">
                                Generate an executive summary of this meeting instantly. Uses the local Qwen Micro-LLM for total privacy.
                            </p>
                            {transcribing && (
                                <p className="text-xs text-yellow-500/80 italic mt-2">
                                    (Generating a summary will stop the current transcription to free up GPU memory)
                                </p>
                            )}
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}

                        <Button
                            onClick={handleGenerateSummary}
                            disabled={isSummarizing || (!!llmStatus && llmStatus.status !== 'ready')}
                            className="gap-2"
                        >
                            {(isSummarizing || (llmStatus && llmStatus.status !== 'ready')) ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {llmStatus?.message || 'Processing...'}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-4 w-4" />
                                    Generate AI Summary
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Chat interface
    return (
        <Card className="flex flex-col h-[500px] shadow-lg border-primary/20">
            <CardHeader className="py-3 px-4 bg-muted/30 border-b flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Meeting Assistant
                </CardTitle>
            </CardHeader>

            <CardContent className="flex-1 p-0 flex flex-col overflow-hidden">
                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-xl px-4 py-2 ${msg.role === 'user'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted/60 text-foreground'
                                    }`}
                            >
                                <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                            </div>
                        </div>
                    ))}

                    {/* Loading Indicator for Chat */}
                    {llmStatus?.status === 'generating' && messages[messages.length - 1].role === 'user' && (
                        <div className="flex justify-start">
                            <div className="bg-muted/60 max-w-[80%] rounded-xl px-4 py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </div>
                        </div>
                    )}
                    {error && <div className="text-center text-xs text-destructive">{error}</div>}
                    <div ref={bottomRef} />
                </div>

                {/* Chat Input */}
                <div className="p-3 border-t bg-muted/10">
                    <form onSubmit={handleSendMessage} className="flex gap-2">
                        <Input
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Ask Qwen about the meeting..."
                            disabled={isSending || isSummarizing}
                            className="flex-1"
                        />
                        <Button
                            type="submit"
                            size="icon"
                            disabled={!inputValue.trim() || isSending || isSummarizing}
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </form>
                </div>
            </CardContent>
        </Card>
    );
}
