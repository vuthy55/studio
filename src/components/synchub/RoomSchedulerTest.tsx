
"use client";

import { useState, useEffect } from 'react';
import { format, parse } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarIcon } from 'lucide-react';

export default function RoomSchedulerTest() {
    const [scheduledDate, setScheduledDate] = useState<Date>(new Date());
    const [dateInput, setDateInput] = useState('');
    const [popoverOpen, setPopoverOpen] = useState(false);

    // Effect to initialize or update the text input when the Date object changes.
    useEffect(() => {
        setDateInput(format(scheduledDate, 'd MMM yyyy, h:mm aa'));
    }, [scheduledDate]);

    // Handler for when the user types in the text input.
    const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDateString = e.target.value;
        setDateInput(newDateString); // Update the visual input immediately

        // Try to parse the input. If it's a valid date, update the actual state.
        try {
            const parsedDate = parse(newDateString, 'd MMM yyyy, h:mm aa', new Date());
            if (!isNaN(parsedDate.getTime())) {
                setScheduledDate(parsedDate);
            }
        } catch (error) {
            // Ignore errors while the user is still typing.
        }
    };
    
    // Handler for when the user selects a date from the calendar.
    const handleCalendarSelect = (date: Date | undefined) => {
        if (!date) return;
        // Keep the time from the existing state, only change the date part.
        const newDate = new Date(scheduledDate.getTime());
        newDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setScheduledDate(newDate);
    };

    // Handler for when the user changes the time input.
    const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const [hours, minutes] = e.target.value.split(':').map(Number);
        const newDate = new Date(scheduledDate.getTime());
        if (!isNaN(hours) && !isNaN(minutes)) {
            newDate.setHours(hours, minutes);
            setScheduledDate(newDate);
        }
    };

    return (
        <Card className="max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>Sync Room Scheduler Test</CardTitle>
                <CardDescription>
                    This is an isolated component to test the date and time selection logic.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="space-y-2">
                    <Label>Date & Time</Label>
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                        <PopoverTrigger asChild>
                             <Button
                                variant={"outline"}
                                className="w-full justify-start text-left font-normal"
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateInput || "Pick a date"}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={scheduledDate}
                                onSelect={handleCalendarSelect}
                                initialFocus
                            />
                            <div className="p-3 border-t border-border">
                                <Label className="text-sm">Time</Label>
                                <Input
                                    type="time"
                                    value={format(scheduledDate, 'HH:mm')}
                                    onChange={handleTimeChange}
                                />
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-2">
                    <Label>Direct Text Input (Mirrors Popover)</Label>
                     <Input
                        value={dateInput}
                        onChange={handleDateInputChange}
                        placeholder="e.g., 25 Dec 2024, 10:30 AM"
                    />
                </div>
                 <div className="p-4 bg-muted rounded-md text-sm">
                    <h4 className="font-semibold mb-2">Current State Value:</h4>
                    <pre className="font-mono whitespace-pre-wrap break-all">
                        <code>
                            {scheduledDate.toISOString()}
                        </code>
                    </pre>
                 </div>
            </CardContent>
        </Card>
    );
}
