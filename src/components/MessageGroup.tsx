'use client';

import type { Message } from '@/types';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import { SummaryReport } from './SummaryReport';

interface MessageGroupProps {
    messages: Message[];
}

export function MessageGroup({ messages }: MessageGroupProps) {
    const [formattedDate, setFormattedDate] = useState('');

    useEffect(() => {
        if (messages.length > 0) {
            setFormattedDate(format(new Date(messages[0].createdAt), "MMM d, yyyy 'at' h:mm a"));
        }
    }, [messages]);

    if (messages.length === 0) {
        return null;
    }

    const speaker = messages[0].speaker;

    // Special handling for Final Summary Report
    if (speaker === 'SUMMARY_REPORT') {
        return <SummaryReport message={messages[0]} />;
    }

    const isSpeaker01 = speaker === 'SPEAKER_01';

    return (
        <div className={`flex flex-col ${isSpeaker01 ? 'items-end' : 'items-start'} animate-in fade-in-50 slide-in-from-bottom-2 duration-500`}>
            {speaker && (
                <span className="text-xs text-muted-foreground mb-1 mx-1 font-semibold">
                    {speaker}
                </span>
            )}
            <Card className={`max-w-[80%] ${isSpeaker01 ? 'bg-primary text-primary-foreground' : 'bg-card/80 dark:bg-card/50'}`}>
                <CardContent className="p-3 space-y-2">
                    {messages.map((message, index) => (
                        <p key={index} className={isSpeaker01 ? 'text-primary-foreground' : 'text-foreground'}>
                            {message.message}
                        </p>
                    ))}
                </CardContent>
            </Card>
            <span className={`text-[10px] text-muted-foreground mt-1 mx-1`}>
                {formattedDate}
            </span>
        </div>
    );
}
