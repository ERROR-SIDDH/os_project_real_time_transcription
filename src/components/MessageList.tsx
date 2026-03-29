'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback, useTransition } from 'react';
import { getMessages } from '@/actions/actions';
import type { Message } from '@/types';
import { MessageGroup } from './MessageGroup';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Terminal, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { startOfMinute } from 'date-fns';
import { Button } from './ui/button';

interface MessageListProps {
  roomId: string;
}

const groupMessages = (messages: Message[]): Message[][] => {
  if (!messages || messages.length === 0) {
    return [];
  }

  const groups: Message[][] = [];
  let currentGroup: Message[] = [messages[0]];

  for (let i = 1; i < messages.length; i++) {
    const prev = messages[i - 1];
    const curr = messages[i];

    const prevMinute = startOfMinute(new Date(prev.createdAt)).toISOString();
    const currMinute = startOfMinute(new Date(curr.createdAt)).toISOString();

    const sameMinute = prevMinute === currMinute;
    const sameSpeaker = prev.speaker === curr.speaker;

    if (sameMinute && sameSpeaker) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);

  return groups;
};

export function MessageList({ roomId }: MessageListProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const scrollViewportRef = useRef<HTMLDivElement>(null);

  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  const fetchMessages = useCallback(async () => {
    try {
      const newMessages = await getMessages(roomId);
      setMessages(newMessages);
    } catch (err) {
      const errorMessage = 'Failed to load messages.';
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not fetch messages for this room.",
      });
    }
  }, [roomId, toast]);

  const handleRefresh = () => {
    startTransition(() => {
      fetchMessages();
    });
  }

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setMessages([]);

    fetchMessages().finally(() => {
      setIsLoading(false);
    });

    const eventSource = new EventSource(`/api/stream/${roomId}`);

    eventSource.onmessage = (event) => {
      try {
        const newMessage = JSON.parse(event.data);
        setMessages((prevMessages) => [...prevMessages, newMessage]);
      } catch (e) {
        console.error('Failed to parse incoming message:', e);
      }
    };

    eventSource.onerror = () => {
      console.error("SSE connection error. The connection will be closed.");
      toast({
        variant: "destructive",
        title: "Connection Lost",
        description: "Lost connection to the server. Please try re-joining the room.",
      });
      eventSource.close();
    }

    return () => {
      eventSource.close();
    };
  }, [roomId, toast, fetchMessages]);

  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollViewportRef.current) {
        scrollViewportRef.current.scrollTo({ top: scrollViewportRef.current.scrollHeight, behavior: 'smooth' });
      }
    };
    // A short delay ensures the DOM has updated before we try to scroll.
    const timeoutId = setTimeout(scrollToBottom, 100);
    return () => clearTimeout(timeoutId);
  }, [messageGroups]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-4 p-1">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-start space-x-4">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-8 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <Alert variant="destructive">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      );
    }

    if (messageGroups.length === 0) {
      return (
        <Alert>
          <Terminal className="h-4 w-4" />
          <AlertTitle>No messages yet!</AlertTitle>
          <AlertDescription>
            This room is quiet for now. Messages from your transcription service will appear here in real-time.
          </AlertDescription>
        </Alert>
      )
    }

    return messageGroups.map((group, index) => (
      <MessageGroup key={index} messages={group} />
    ));
  };

  return (
    <Card className="w-full h-[70vh] flex flex-col shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="font-headline">
            Room Transcription: <span className="font-mono text-accent">{roomId}</span>
          </CardTitle>
          <Button variant="outline" size="icon" onClick={handleRefresh} disabled={isPending}>
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            <span className="sr-only">Refresh Messages</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-grow min-h-0 flex flex-col">
        <ScrollArea className="h-full pr-4 mt-4" viewportRef={scrollViewportRef}>
          <div className="flex flex-col gap-4">
            {renderContent()}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
