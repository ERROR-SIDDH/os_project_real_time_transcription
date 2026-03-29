'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger
} from '@/components/ui/accordion';
import { FileText, Sparkles, Quote } from 'lucide-react';
import type { Message } from '@/types';

interface SummaryReportProps {
    message: Message;
}

export function SummaryReport({ message }: SummaryReportProps) {
    const { message: summaryText, full_transcript } = message;

    return (
        <div className="w-full my-6 animate-in fade-in-50 zoom-in-95 duration-700">
            <Card className="border-2 border-primary/20 bg-gradient-to-b from-primary/5 to-background shadow-xl">
                <CardHeader className="pb-3 border-b border-primary/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                <Sparkles size={20} />
                            </div>
                            <CardTitle className="text-xl font-headline tracking-tight">
                                AI Meeting Summary
                            </CardTitle>
                        </div>
                        <Badge variant="default" className="bg-primary/80">Final Report</Badge>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                    <div className="relative group">
                        <div className="absolute -left-3 top-0 bottom-0 w-1 bg-primary/20 rounded-full" />
                        <p className="text-lg leading-relaxed text-foreground/90 font-medium pl-4 italic">
                            "{summaryText}"
                        </p>
                    </div>

                    {full_transcript && full_transcript.length > 0 && (
                        <Accordion type="single" collapsible className="w-full border rounded-xl px-4 bg-background/50">
                            <AccordionItem value="transcript" className="border-none">
                                <AccordionTrigger className="hover:no-underline py-4">
                                    <div className="flex items-center gap-2 text-muted-foreground font-semibold">
                                        <FileText size={18} />
                                        <span>View Full Meeting Transcript ({full_transcript.length} lines)</span>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="space-y-3 pt-2 pb-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {full_transcript.map((line, idx) => (
                                            <div key={idx} className="flex gap-3 text-sm group">
                                                <span className="text-primary/40 font-mono mt-0.5 tabular-nums min-w-[20px]">
                                                    {(idx + 1).toString().padStart(2, '0')}
                                                </span>
                                                <p className="text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                                                    {line}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
