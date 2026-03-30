'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BackendControl } from '@/components/BackendControl';
import { Room } from '@/components/Room';
import { Settings, MessageSquare } from 'lucide-react';

export function DashboardTabs() {
    return (
        <Tabs defaultValue="control" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="control" className="flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Control Panel
                </TabsTrigger>
                <TabsTrigger value="transcription" className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Transcription
                </TabsTrigger>
            </TabsList>
            <TabsContent value="control">
                <BackendControl />
            </TabsContent>
            <TabsContent value="transcription">
                <Room />
            </TabsContent>
        </Tabs>
    );
}
