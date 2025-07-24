
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, serverTimestamp, setDoc, doc, query, where, getDocs, deleteDoc, writeBatch, getDocs as getSubCollectionDocs, updateDoc, arrayRemove, arrayUnion, limit, Timestamp, increment } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { LoaderCircle, PlusCircle, Wifi, Copy, List, ArrowRight, Trash2, CheckSquare, ShieldCheck, XCircle, UserX, UserCheck, FileText, Edit, Save, Share2, Download, Settings, Languages as TranslateIcon, RefreshCw, Calendar as CalendarIcon, Users } from 'lucide-react';
import type { SyncRoom, TranslatedContent } from '@/lib/types';
import { azureLanguages, type AzureLanguageCode, getAzureLanguageLabel } from '@/lib/azure-languages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Separator } from '../ui/separator';
import { getAppSettingsAction, type AppSettings } from '@/actions/settings';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { updateRoomSummary, softDeleteRoom, permanentlyDeleteRooms, checkRoomActivity, requestSummaryEditAccess, updateScheduledRoom } from '@/actions/room';
import { summarizeRoom } from '@/ai/flows/summarize-room-flow';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { languages } from '@/lib/data';
import { translateSummary } from '@/ai/flows/translate-summary-flow';
import { useUserData } from '@/context/UserDataContext';
import { Calendar } from '../ui/calendar';
import { cn } from '@/lib/utils';
import { format, parse } from 'date-fns';
import BuyTokens from '../BuyTokens';


interface InvitedRoom extends SyncRoom {
    id: string;
}

function RoomSummaryDialog({ room, onUpdate }: { room: InvitedRoom; onUpdate: () => void }) {
    const { userProfile, user } = useUserData();
    const { toast, dismiss } = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [editableSummary, setEditableSummary] = useState(room.summary);
    const [isSaving, setIsSaving] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

    useEffect(() => {
        setEditableSummary(room.summary);
    }, [room.summary]);

    const isEmcee = useMemo(() => {
        if (!user || !room) return false;
        return room.creatorUid === user.uid || (user.email && room.emceeEmails?.includes(user.email));
    }, [user, room]);
    
    const canEditSummary = isEmcee || room.summary?.allowMoreEdits;

    const availableLanguages = useMemo(() => {
        if (!editableSummary) return [];
        const langSet = new Set<string>();
        
        const allParticipants = [...editableSummary.presentParticipants, ...editableSummary.absentParticipants];

        allParticipants.forEach(p => {
            if (p.language && typeof p.language === 'string') {
                const lang = languages.find(l => l.label.toLowerCase() === p.language.split(' ')[0].toLowerCase());
                if (lang) {
                    langSet.add(lang.value);
                }
            }
        });

        // Add all supported languages, prioritizing participant languages
        const participantLangs = Array.from(langSet);
        const otherLangs = languages.map(l => l.value).filter(l => !participantLangs.includes(l));
        
        return {
            participantLanguages: participantLangs.map(v => languages.find(l => l.value === v)!),
            otherLanguages: otherLangs.map(v => languages.find(l => l.value === v)!)
        };
    }, [editableSummary]);

    const formatDate = (dateString: string) => {
        if (!dateString || typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateString)) return "Unknown Date";
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return "Invalid Date";
            return new Intl.DateTimeFormat('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC' // Important to avoid off-by-one day errors
            }).format(date);
        } catch (e) {
            console.error("Error formatting date:", e);
            return "Invalid Date";
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const keys = name.split('.');
        setEditableSummary(prev => {
            if (!prev) return null;
            const newSummary = JSON.parse(JSON.stringify(prev)); // Deep copy
            let current: any = newSummary;
            for (let i = 0; i < keys.length - 1; i++) {
                current = current[keys[i]];
            }
            current[keys[keys.length - 1]] = value;
            return newSummary;
        });
    };
    
    const handleActionItemChange = (index: number, field: string, value: any) => {
        if (!editableSummary) return;
        const newActionItems = [...editableSummary.actionItems];
        if (field === 'task') {
            newActionItems[index].task = { ...newActionItems[index].task, original: value };
        } else {
            (newActionItems[index] as any)[field] = value;
        }
        setEditableSummary({ ...editableSummary, actionItems: newActionItems });
    };

    const addActionItem = () => {
        if (!editableSummary) return;
        const newActionItems = [...editableSummary.actionItems, { task: { original: '', translations: {} }, personInCharge: '', dueDate: '' }];
        setEditableSummary({ ...editableSummary, actionItems: newActionItems });
    };

    const removeActionItem = (index: number) => {
        if (!editableSummary) return;
        const newActionItems = editableSummary.actionItems.filter((_, i) => i !== index);
        setEditableSummary({ ...editableSummary, actionItems: newActionItems });
    };

    const handleSaveChanges = async () => {
        if (!editableSummary || !user) return;
        setIsSaving(true);
        try {
            const editHistory = [
                ...(editableSummary.editHistory || []),
                { editorUid: user.uid, editorName: user.displayName || user.email, editorEmail: user.email, editedAt: serverTimestamp() }
            ];
            const updatedSummary = { ...editableSummary, editHistory };
            
            const result = await updateRoomSummary(room.id, updatedSummary);
            if (result.success) {
                toast({ title: 'Success', description: 'Summary updated successfully.' });
                setIsEditing(false);
                onUpdate();
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to update summary.' });
            }
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRequestEditAccess = async () => {
        if (!user) return;
        setIsSaving(true);
        const result = await requestSummaryEditAccess(room.id, room.topic, user.displayName || 'A user');
        if (result.success) {
            toast({ title: 'Request Sent', description: 'Admins have been notified of your request.' });
        } else {
             toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to send request.' });
        }
        setIsSaving(false);
    };

    
    const handleDownload = () => {
        if (!editableSummary) return;

        let content = `Meeting Summary\n`;
        content += `================\n\n`;
        content += `Title: ${editableSummary.title}\n`;
        content += `Date: ${formatDate(editableSummary.date)}\n\n`;
        content += `Summary:\n${editableSummary.summary.original}\n\n`;
        
        Object.entries(editableSummary.summary.translations || {}).forEach(([lang, text]) => {
            content += `\n--- Translation (${lang}) ---\n${text}\n`;
        });
        
        content += `\nAction Items:\n`;
        editableSummary.actionItems.forEach((item, index) => {
            content += `${index + 1}. ${item.task.original}\n`;
             Object.entries(item.task.translations || {}).forEach(([lang, text]) => {
                content += `   (${lang}): ${text}\n`;
            });
            content += `   - Assigned to: ${item.personInCharge || 'N/A'}\n`;
            content += `   - Due: ${item.dueDate || 'N/A'}\n`;
        });
        
        content += `\nParticipants Present:\n`;
         editableSummary.presentParticipants.forEach(p => {
             content += `- ${p.name} (${p.email})\n`;
        });
        content += `\nParticipants Absent:\n`;
         editableSummary.absentParticipants.forEach(p => {
             content += `- ${p.name} (${p.email})\n`;
        });


        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${editableSummary.title.replace(/\s+/g, '_')}_summary.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

     const handleTranslate = async () => {
        if (selectedLanguages.length === 0 || !editableSummary || !user) {
            toast({ variant: 'destructive', title: 'No Languages Selected', description: 'Please select at least one language to translate to.' });
            return;
        }
        setIsTranslating(true);
        const { id: toastId } = toast({ title: 'Translating Summary...', description: 'This may take a moment.' });
        try {
            const result = await translateSummary({
                summary: editableSummary,
                targetLanguages: selectedLanguages,
                roomId: room.id,
                userId: user.uid,
            });
            setEditableSummary(result);
            dismiss(toastId);
            toast({ title: 'Success', description: 'Summary translated and saved.' });
            onUpdate();
        } catch (error: any) {
             console.error(error);
             dismiss(toastId);
            toast({ variant: 'destructive', title: 'Translation Failed', description: error.message || 'Could not translate the summary.' });
        } finally {
            setIsTranslating(false);
            setSelectedLanguages([]);
        }
    }

    if (!editableSummary) return null;

    const editCount = editableSummary.editHistory?.length || 0;
    const canStillEdit = canEditSummary && editCount < 2;

    return (
        <Dialog>
            <DialogTrigger asChild>
                 <Button variant="outline" size="sm">
                    <FileText className="mr-2 h-4 w-4" />
                    View Summary
                 </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
                <DialogHeader>
                    {isEditing ? (
                        <Input 
                            name="title" 
                            value={editableSummary.title} 
                            onChange={handleInputChange} 
                            className="text-lg font-semibold h-auto p-0 border-0 shadow-none focus-visible:ring-0"
                        />
                    ) : (
                        <DialogTitle>{editableSummary.title}</DialogTitle>
                    )}
                    <DialogDescription>
                        Meeting held on {formatDate(editableSummary.date)}
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="max-h-[60vh] p-1">
                <div className="space-y-6 pr-4">
                    <div>
                        <h3 className="font-semibold text-lg mb-2">Summary</h3>
                        {isEditing ? (
                            <Textarea 
                                value={editableSummary.summary.original} 
                                name="summary.original"
                                onChange={handleInputChange}
                                className="w-full min-h-[150px]"
                            />
                        ) : (
                            <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                                <p className="font-semibold text-foreground">{editableSummary.summary.original}</p>
                                {Object.entries(editableSummary.summary.translations || {}).map(([lang, text]) => (
                                    <div key={lang} className="mt-2 p-2 border-l-2 border-primary bg-muted/50 rounded-r-md">
                                        <p className="font-bold text-xs text-primary">{languages.find(l => l.value === lang)?.label}</p>
                                        <p>{text}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-2">
                             <h3 className="font-semibold text-lg">Action Items</h3>
                             {isEditing && (
                                <Button size="sm" variant="outline" onClick={addActionItem}><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
                             )}
                        </div>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>PIC</TableHead>
                                    <TableHead>Due</TableHead>
                                    {isEditing && <TableHead className="w-[50px]"></TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {editableSummary.actionItems.map((item, index) => (
                                    <TableRow key={`action-${index}`}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>
                                            {isEditing ? (
                                                <Input value={item.task.original} onChange={(e) => handleActionItemChange(index, 'task', e.target.value)} />
                                            ) : (
                                                 <div className="text-sm whitespace-pre-wrap">
                                                    <p className="font-semibold">{item.task.original}</p>
                                                     {Object.entries(item.task.translations || {}).map(([lang, text]) => (
                                                        <div key={lang} className="mt-1 pl-2 border-l-2">
                                                            <p className="font-bold text-xs">{languages.find(l => l.value === lang)?.label}</p>
                                                            <p className="text-muted-foreground">{text}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {isEditing ? (
                                                <Input value={item.personInCharge || ''} onChange={(e) => handleActionItemChange(index, 'personInCharge', e.target.value)} />
                                            ) : (
                                                item.personInCharge || 'N/A'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {isEditing ? (
                                                <Input value={item.dueDate || ''} type="date" onChange={(e) => handleActionItemChange(index, 'dueDate', e.target.value)} />
                                            ) : (
                                                item.dueDate || 'N/A'
                                            )}
                                        </TableCell>
                                         {isEditing && (
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => removeActionItem(index)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                         )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    
                    <div className="space-y-4">
                        <h3 className="font-semibold text-lg">Participants</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <h4 className="font-medium flex items-center gap-1.5 text-green-600"><UserCheck/> Present</h4>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Email</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {editableSummary.presentParticipants.map((p, i) => (
                                            <TableRow key={`present-${i}`}>
                                                <TableCell>{p.name}</TableCell>
                                                <TableCell>{p.email}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                             <div className="space-y-2">
                                <h4 className="font-medium flex items-center gap-1.5 text-red-600"><UserX/> Absent</h4>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Email</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {editableSummary.absentParticipants.map((p, i) => (
                                            <TableRow key={`absent-${i}`}>
                                                <TableCell>{p.name}</TableCell>
                                                <TableCell>{p.email}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                </div>
                </ScrollArea>
                 <DialogFooter>
                    {isEditing ? (
                        <>
                            <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                            <Button onClick={handleSaveChanges} disabled={isSaving}>
                                {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>}
                                Save Changes
                            </Button>
                        </>
                    ) : (
                         <>
                             <div className="flex-grow flex gap-2">
                                <Button variant="secondary" onClick={handleDownload}><Download className="mr-2 h-4 w-4"/> Download</Button>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="secondary" disabled={isTranslating}>
                                            <TranslateIcon className="mr-2 h-4 w-4" /> Translate
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80">
                                        <div className="grid gap-4">
                                            <div className="space-y-2">
                                                <h4 className="font-medium leading-none">Translate Summary</h4>
                                                <p className="text-sm text-muted-foreground">Select languages. Cost is per language.</p>
                                            </div>
                                             <ScrollArea className="max-h-48">
                                                <div className="grid gap-2 p-1">
                                                    {availableLanguages.participantLanguages.length > 0 && (
                                                        <>
                                                            <p className="font-semibold text-xs text-muted-foreground px-2">Participant Languages</p>
                                                            {availableLanguages.participantLanguages.map((lang) => (
                                                                <div key={`pl-${lang.value}`} className="flex items-center space-x-2">
                                                                    <Checkbox id={`lang-${lang.value}`} checked={selectedLanguages.includes(lang.value)} onCheckedChange={(checked) => setSelectedLanguages(prev => checked ? [...prev, lang.value] : prev.filter(l => l !== lang.value))} />
                                                                    <Label htmlFor={`lang-${lang.value}`}>{lang.label}</Label>
                                                                </div>
                                                            ))}
                                                            <Separator className="my-2" />
                                                        </>
                                                    )}
                                                     <p className="font-semibold text-xs text-muted-foreground px-2">Other Languages</p>
                                                    {availableLanguages.otherLanguages.map((lang) => (
                                                        <div key={`ol-${lang.value}`} className="flex items-center space-x-2">
                                                            <Checkbox id={`lang-${lang.value}`} checked={selectedLanguages.includes(lang.value)} onCheckedChange={(checked) => setSelectedLanguages(prev => checked ? [...prev, lang.value] : prev.filter(l => l !== lang.value))} />
                                                            <Label htmlFor={`lang-${lang.value}`}>{lang.label}</Label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </ScrollArea>
                                            <Button onClick={handleTranslate} disabled={isTranslating || selectedLanguages.length === 0}>
                                                {isTranslating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : `Translate for ${userProfile?.settings?.summaryTranslationCost! * selectedLanguages.length} Tokens`}
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            {canStillEdit ? (
                                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                                    <Edit className="mr-2 h-4 w-4"/> Edit ({editCount}/2)
                                </Button>
                            ) : isEmcee && (
                                <Button variant="secondary" onClick={handleRequestEditAccess} disabled={isSaving}>
                                     {isSaving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/> : <Share2 className="mr-2 h-4 w-4"/>}
                                    Request Edit Access
                                </Button>
                            )}
                            <DialogClose asChild>
                                <Button variant="outline">Close</Button>
                            </DialogClose>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function ManageRoomDialog({ room, user, onUpdate }: { room: InvitedRoom; user: any; onUpdate: () => void }) {
    const { toast, dismiss } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [hasCheckedActivity, setHasCheckedActivity] = useState(false);
    const [hasActivity, setHasActivity] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);

    const doCheckRoomActivity = async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const result = await checkRoomActivity(room.id, user.uid);
            if (result.success) {
                setHasActivity(result.hasActivity ?? false);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: result.error });
                setHasActivity(false); // Default to safer state on error
            }
        } catch (error) {
            console.error("Error checking room activity:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not check room activity.' });
            setHasActivity(false);
        } finally {
            setIsLoading(false);
            setHasCheckedActivity(true);
        }
    };
    
    const handleOpenChange = (open: boolean) => {
        setIsOpen(open);
        if (open && !hasCheckedActivity && room.status !== 'closed' && room.status !== 'scheduled') {
            doCheckRoomActivity();
        }
        if (!open) {
            setHasCheckedActivity(false); // Reset for next time
        }
    };

    const handleSoftDelete = async () => {
        setIsActionLoading(true);
        const result = await softDeleteRoom(room.id);
        if (result.success) {
            toast({ title: 'Room Closed', description: 'The room has been closed for all participants.' });
            onUpdate();
            setIsOpen(false);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to close room.' });
        }
        setIsActionLoading(false);
    };
    
    const handlePermanentDelete = async () => {
        setIsActionLoading(true);
        const result = await permanentlyDeleteRooms([room.id]);
        if (result.success) {
            toast({ title: 'Room Deleted', description: 'The room has been permanently deleted.' });
            onUpdate();
            setIsOpen(false);
        } else {
            toast({ variant: 'destructive', title: 'Error', description: result.error || 'Failed to delete room.' });
        }
        setIsActionLoading(false);
    };
    
    const handleSummarizeAndEnd = async () => {
        setIsActionLoading(true);
        const { id: toastId } = toast({ title: 'Summarizing...', description: 'The AI is generating a meeting summary. This may take a moment.', duration: 120000 });
        try {
            await summarizeRoom({ roomId: room.id });
            toast({ title: 'Summary Saved!', description: 'The meeting has ended and the summary is available.' });
            onUpdate();
            setIsOpen(false);
        } catch (error) {
            console.error("Error summarizing and ending meeting:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not save the summary.' });
        } finally {
             setIsActionLoading(false);
             if (toastId) dismiss(toastId);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="icon"><Settings className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Manage Room: {room.topic}</DialogTitle>
                    <DialogDescription>
                        Choose an action to perform on this room.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="text-xs text-muted-foreground pt-2 font-mono">
                  {room.paymentLogId && <div>Payment ID: {room.paymentLogId}</div>}
                </div>


                {isLoading ? (
                    <div className="flex items-center justify-center h-24">
                        <LoaderCircle className="animate-spin" />
                    </div>
                ) : room.status === 'scheduled' ? (
                     <div className="py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">This room is scheduled. You can cancel and delete it, which will notify participants.</p>
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isActionLoading}>
                                    {isActionLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                    Cancel and Delete Room
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently delete the room and notify invited participants.
                                        {(room.initialCost ?? 0) > 0 && 
                                            <span className="font-bold block mt-2"> {room.initialCost} tokens will be refunded to your account.</span>
                                        }
                                        This action cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Go Back</AlertDialogCancel>
                                    <AlertDialogAction onClick={handlePermanentDelete}>Confirm Cancellation</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                ) : room.status === 'closed' ? (
                     <div className="py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">This room is closed.</p>
                    </div>
                ) : hasCheckedActivity && room.status === 'active' && (
                    <div className="py-4 space-y-4">
                        {hasActivity ? (
                            <>
                                <p className="text-sm text-muted-foreground">This room has had meeting activity. You can close it for all users.</p>
                                <div className="flex flex-col gap-2">
                                     <Button onClick={handleSoftDelete} disabled={isActionLoading} variant="destructive">
                                        {isActionLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                        Close Room
                                    </Button>
                                </div>
                            </>
                        ) : (
                             <>
                                <p className="text-sm text-muted-foreground">This room appears to be empty. You can permanently delete it.</p>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="destructive" disabled={isActionLoading}>
                                            {isActionLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                            Permanently Delete Room
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action cannot be undone. This will permanently delete the room and all of its data.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handlePermanentDelete}>Delete</AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </>
                        )}
                    </div>
                )}
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

export default function SyncOnlineHome() {
    const { user, userProfile, loading } = useUserData();
    const router = useRouter();
    const { toast } = useToast();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [roomTopic, setRoomTopic] = useState('');
    const [creatorLanguage, setCreatorLanguage] = useState<AzureLanguageCode | ''>('');
    const [inviteeEmails, setInviteeEmails] = useState('');
    const [emceeEmails, setEmceeEmails] = useState<string[]>([]);
    const [isRoomDialogOpen, setIsRoomDialogOpen] = useState(false);
    const [duration, setDuration] = useState(30);
    const [scheduledDate, setScheduledDate] = useState<Date | undefined>(new Date());
    const [editingRoom, setEditingRoom] = useState<InvitedRoom | null>(null);
    const [dateInput, setDateInput] = useState('');
    
    const [invitedRooms, setInvitedRooms] = useState<InvitedRoom[]>([]);
    const [isFetchingRooms, setIsFetchingRooms] = useState(true);

    const [isClient, setIsClient] = useState(false);
    const { settings } = useUserData();
    
    const [currentlyManagedRoom, setCurrentlyManagedRoom] = useState<InvitedRoom | null>(null);

    useEffect(() => {
        setIsClient(true);
    }, []);

    const isEditMode = useMemo(() => !!editingRoom, [editingRoom]);

     useEffect(() => {
        if (isEditMode && editingRoom) {
            setRoomTopic(editingRoom.topic);
            setInviteeEmails(editingRoom.invitedEmails.filter(e => e !== user?.email).join(', '));
            setEmceeEmails(editingRoom.emceeEmails);
            setDuration(editingRoom.durationMinutes || 30);
            
             const validDate = editingRoom.scheduledAt && typeof editingRoom.scheduledAt === 'string' && !isNaN(new Date(editingRoom.scheduledAt).getTime())
                ? new Date(editingRoom.scheduledAt)
                : new Date();
            setScheduledDate(validDate);
            setDateInput(format(validDate, 'd MMM yyyy, h:mm aa'));

        } else {
            const defaultDate = new Date();
            setRoomTopic('');
            setCreatorLanguage('');
            setInviteeEmails('');
            setEmceeEmails(user?.email ? [user.email] : []);
            setDuration(30);
            setScheduledDate(defaultDate);
            setDateInput(format(defaultDate, 'd MMM yyyy, h:mm aa'));
        }
    }, [editingRoom, isEditMode, user?.email]);


    const parsedInviteeEmails = useMemo(() => {
        return inviteeEmails.split(/[ ,]+/).map(email => email.trim()).filter(Boolean);
    }, [inviteeEmails]);

    const allInvitedEmailsForCalc = useMemo(() => {
        return [...new Set([user?.email, ...parsedInviteeEmails].filter(Boolean) as string[])];
    }, [parsedInviteeEmails, user?.email]);

    const calculatedCost = useMemo(() => {
        if (!settings) return 0;
        const numParticipants = allInvitedEmailsForCalc.length;
        return numParticipants * duration * (settings.costPerSyncOnlineMinute || 1);
    }, [settings, duration, allInvitedEmailsForCalc]);

    const costDifference = useMemo(() => {
        if (!isEditMode || !editingRoom) return 0;
        return calculatedCost - (editingRoom.initialCost || 0);
    }, [isEditMode, editingRoom, calculatedCost]);
    
     const toggleEmcee = (email: string) => {
        setEmceeEmails(prev => 
            prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
        );
    };
    
    useEffect(() => {
        if(scheduledDate) {
            setDateInput(format(scheduledDate, 'd MMM yyyy, h:mm aa'));
        }
    }, [scheduledDate]);

    const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDateString = e.target.value;
        setDateInput(newDateString);
        // Attempt to parse the date string. If valid, update the Date object.
        try {
            const parsedDate = parse(newDateString, 'd MMM yyyy, h:mm aa', new Date());
            if (!isNaN(parsedDate.getTime())) {
                setScheduledDate(parsedDate);
            }
        } catch (error) {
            // Ignore parse errors while user is typing
        }
    };


    const fetchInvitedRooms = useCallback(async () => {
        if (!user) {
            setInvitedRooms([]);
            setIsFetchingRooms(false);
            return;
        }
        setIsFetchingRooms(true);
        try {
            const roomsRef = collection(db, 'syncRooms');
            const q = query(roomsRef, where("invitedEmails", "array-contains", user.email));
            const querySnapshot = await getDocs(q);
            const rooms = querySnapshot.docs
                .map(doc => {
                    const data = doc.data();
                     const toISO = (ts: any): string | undefined => {
                        if (ts instanceof Timestamp) {
                            return ts.toDate().toISOString();
                        }
                        if (typeof ts === 'string' && !isNaN(new Date(ts).getTime())) {
                            return ts;
                        }
                        if (ts && typeof ts.seconds === 'number' && typeof ts.nanoseconds === 'number') {
                             return new Timestamp(ts.seconds, ts.nanoseconds).toDate().toISOString();
                        }
                        return undefined;
                    };

                    return { 
                        id: doc.id, 
                        ...data,
                        createdAt: toISO(data.createdAt),
                        lastActivityAt: toISO(data.lastActivityAt),
                        scheduledAt: toISO(data.scheduledAt),
                    } as InvitedRoom;
                })
                .filter(room => room.status === 'active' || room.status === 'scheduled' || room.summary)
                .sort((a, b) => (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime()));
            
            setInvitedRooms(rooms);
        } catch (error: any) {
            console.error("Error fetching invited rooms:", error);
            if (error.code === 'failed-precondition') {
                 toast({ 
                    variant: "destructive", 
                    title: "Error: Missing Index", 
                    description: "A Firestore index is required. Please check the browser console for a link to create it.",
                    duration: 10000
                });
                console.error("FULL FIREBASE ERROR - You probably need to create an index. Look for a URL in this error message to create it automatically:", error);
            } else {
                toast({ variant: 'destructive', title: 'Could not fetch rooms', description: 'There was an error fetching your room invitations.' });
            }
        } finally {
            setIsFetchingRooms(false);
        }
    }, [user, toast]);

    useEffect(() => {
        if (user) {
            fetchInvitedRooms();
        } else if (!loading) {
             setIsFetchingRooms(false);
             setInvitedRooms([]);
        }
    }, [user, loading, fetchInvitedRooms]);
    
    const handleOpenCreateDialog = () => {
        setEditingRoom(null);
        setIsRoomDialogOpen(true);
    };

    const handleOpenEditDialog = (room: InvitedRoom) => {
        setEditingRoom(room);
        setIsRoomDialogOpen(true);
    };
    
    const resetAndClose = () => {
        setEditingRoom(null);
        setIsRoomDialogOpen(false);
    };

    const handleSubmitRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email || !userProfile || !scheduledDate) {
            toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to create or edit a room.' });
            return;
        }
        
        const requiredFields = isEditMode ? [roomTopic] : [roomTopic, creatorLanguage];
        if (requiredFields.some(f => !f)) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please fill out all required fields.' });
            return;
        }
        
        // Final validation of the text input for the date
        const finalParsedDate = parse(dateInput, 'd MMM yyyy, h:mm aa', new Date());
        if (isNaN(finalParsedDate.getTime())) {
            toast({ variant: 'destructive', title: 'Invalid Date', description: 'Please enter a valid date and time format (e.g., 25 Dec 2024, 10:30 AM).' });
            return;
        }

        const allInvitedEmails = [...new Set([...parsedInviteeEmails, user.email])];

        if (settings && allInvitedEmails.length > settings.maxUsersPerRoom) {
            toast({
                variant: 'destructive',
                title: 'Participant Limit Exceeded',
                description: `You can invite a maximum of ${settings.maxUsersPerRoom - 1} other participants (total ${settings.maxUsersPerRoom}).`,
            });
            return;
        }

        setIsSubmitting(true);
        try {
            if (isEditMode && editingRoom) {
                 if ((userProfile.tokenBalance || 0) + (editingRoom.initialCost || 0) < calculatedCost) {
                    toast({ variant: "destructive", title: "Insufficient Tokens", description: `You need ${calculatedCost - ((userProfile.tokenBalance || 0) + (editingRoom.initialCost || 0))} more tokens.` });
                    setIsSubmitting(false);
                    return;
                }
                const result = await updateScheduledRoom({
                    roomId: editingRoom.id,
                    userId: user.uid,
                    updates: {
                        topic: roomTopic,
                        scheduledAt: finalParsedDate.toISOString(),
                        durationMinutes: duration,
                        invitedEmails: allInvitedEmails,
                        emceeEmails: [...new Set(emceeEmails)],
                    },
                    newCost: calculatedCost
                });
                if(result.success) {
                    toast({ title: "Room Updated!", description: "Your changes have been saved." });
                } else {
                     toast({ variant: "destructive", title: "Update Failed", description: result.error });
                }
            } else {
                 if ((userProfile.tokenBalance || 0) < calculatedCost) {
                    toast({ variant: 'destructive', title: 'Insufficient Tokens', description: `You need ${calculatedCost} tokens to schedule this meeting.`});
                    setIsSubmitting(false);
                    return;
                }
                const batch = writeBatch(db);
                const newRoomRef = doc(collection(db, 'syncRooms'));
                const newPaymentLogRef = doc(collection(db, 'users', user.uid, 'transactionLogs'));
                
                const newRoom: Omit<SyncRoom, 'id'> = {
                    topic: roomTopic,
                    creatorUid: user.uid,
                    creatorName: user.displayName || user.email?.split('@')[0] || 'Creator',
                    createdAt: serverTimestamp(),
                    status: 'scheduled',
                    invitedEmails: allInvitedEmails,
                    emceeEmails: [...new Set(emceeEmails)],
                    blockedUsers: [],
                    lastActivityAt: serverTimestamp(),
                    scheduledAt: Timestamp.fromDate(finalParsedDate),
                    durationMinutes: duration,
                    initialCost: calculatedCost,
                    paymentLogId: newPaymentLogRef.id,
                    hasStarted: false,
                };
                batch.set(newRoomRef, newRoom);
                
                batch.update(doc(db, 'users', user.uid), { tokenBalance: increment(-calculatedCost) });
                
                batch.set(newPaymentLogRef, {
                    actionType: 'live_sync_online_spend',
                    tokenChange: -calculatedCost,
                    timestamp: serverTimestamp(),
                    description: `Pre-paid for scheduled room: "${roomTopic}"`
                });

                await batch.commit();
                
                toast({ title: "Room Scheduled!", description: "Your new room is available in the list below." });
            }
            
            fetchInvitedRooms();
            resetAndClose();

        } catch (error) {
            console.error("Error submitting room:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not submit the room." });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUnblockUser = useCallback(async (room: InvitedRoom, userToUnblock: any) => {
        try {
            const roomRef = doc(db, 'syncRooms', room.id);
            await updateDoc(roomRef, {
                blockedUsers: arrayRemove(userToUnblock)
            });
            toast({ title: 'User Unblocked', description: 'The user can now rejoin the room.' });
            
            setInvitedRooms(prevRooms => prevRooms.map(r => 
                r.id === room.id ? { ...r, blockedUsers: r.blockedUsers?.filter(u => u.uid !== userToUnblock.uid) } : r
            ));

        } catch (error) {
            console.error('Error unblocking user:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not unblock the user.' });
        }
    }, [toast]);
    
    const { activeAndInvited, scheduled, closedWithSummary } = useMemo(() => {
        return invitedRooms.reduce((acc, room) => {
            if (room.status === 'active') {
                acc.activeAndInvited.push(room);
            } else if (room.status === 'scheduled') {
                acc.scheduled.push(room);
            } else if (room.status === 'closed' && room.summary) {
                acc.closedWithSummary.push(room);
            }
            return acc;
        }, { activeAndInvited: [] as InvitedRoom[], scheduled: [] as InvitedRoom[], closedWithSummary: [] as InvitedRoom[] });
    }, [invitedRooms]);

    const canJoinRoom = (room: InvitedRoom) => {
        if (!room.scheduledAt || typeof room.scheduledAt !== 'string') return true; 
        const now = Date.now();
        const scheduledTime = new Date(room.scheduledAt).getTime();
        const gracePeriod = 5 * 60 * 1000; // 5 minutes
        return now >= scheduledTime - gracePeriod;
    };


    if (loading || !isClient) {
        return (
             <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Wifi /> Sync Online</CardTitle>
                    <CardDescription>Create a private room for a real-time, multi-language voice conversation.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <LoaderCircle className="animate-spin h-5 w-5" />
                        <p>Loading user data...</p>
                    </div>
                </CardContent>
            </Card>
        );
    }
    
    const renderRoomList = (rooms: InvitedRoom[], title: string) => (
         <div className="space-y-4">
            <h3 className="font-semibold text-lg">{title} ({rooms.length})</h3>
            {rooms.length > 0 ? (
                <ul className="space-y-3">
                    {rooms.map(room => {
                        const isBlocked = room.blockedUsers?.some(bu => bu.uid === user!.uid);
                        const isCreator = room.creatorUid === user!.uid;
                        const canJoin = room.status === 'active' || (room.status === 'scheduled' && canJoinRoom(room));

                        return (
                            <li key={room.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg gap-2">
                                <div className="flex-grow">
                                    <p className="font-semibold">{room.topic}</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm text-muted-foreground">
                                            {room.status === 'scheduled' && room.scheduledAt && typeof room.scheduledAt === 'string'
                                                ? format(new Date(room.scheduledAt), 'PPpp')
                                                : `Created: ${room.createdAt && typeof room.createdAt === 'string' ? format(new Date(room.createdAt), 'PPp') : '...'}`
                                            }
                                        </p>
                                        {room.status === 'closed' && (
                                            <Badge variant={room.summary ? 'default' : 'destructive'}>
                                                {room.summary ? 'Summary Available' : 'Closed'}
                                            </Badge>
                                        )}
                                        {room.status === 'scheduled' && (
                                             <Badge variant="outline">{room.durationMinutes} min</Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isBlocked && (
                                        <TooltipProvider>
                                            <Tooltip>
                                                <TooltipTrigger>
                                                    <XCircle className="h-5 w-5 text-destructive" />
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>You are blocked from this room.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </TooltipProvider>
                                    )}

                                    {canJoin && !isCreator && (
                                        <Button asChild disabled={isBlocked}>
                                            <Link href={`/sync-room/${room.id}`}>Join Room</Link>
                                        </Button>
                                    )}

                                    {isCreator && canJoin && (
                                        <Button asChild disabled={isBlocked}>
                                            <Link href={`/sync-room/${room.id}`}>Start Room</Link>
                                        </Button>
                                    )}
                                    
                                    {isCreator && room.status === 'scheduled' && (
                                        <Button variant="outline" size="icon" onClick={() => handleOpenEditDialog(room)}><Edit className="h-4 w-4"/></Button>
                                    )}

                                    {room.summary && (
                                        <RoomSummaryDialog room={room} onUpdate={fetchInvitedRooms} />
                                    )}
                                    
                                    {isCreator && room.status !== 'active' && (
                                            <ManageRoomDialog room={room} user={user} onUpdate={fetchInvitedRooms} />
                                    )}

                                    {isCreator && room.blockedUsers && room.blockedUsers.length > 0 && (
                                        <Dialog>
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <DialogTrigger asChild>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="outline" size="icon">
                                                                <UserX className="h-4 w-4" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                    </DialogTrigger>
                                                    <TooltipContent><p>Manage Blocked Users</p></TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                            <DialogContent>
                                                <DialogHeader>
                                                    <DialogTitle>Manage Blocked Users for "{room.topic}"</DialogTitle>
                                                    <DialogDescription>
                                                        You can re-admit users who were previously removed.
                                                    </DialogDescription>
                                                </DialogHeader>
                                                <div className="py-4">
                                                    {room.blockedUsers && room.blockedUsers.length > 0 ? (
                                                        <ul className="space-y-2">
                                                            {room.blockedUsers.map(bu => (
                                                                <li key={bu.uid} className="flex justify-between items-center">
                                                                    <span>{bu.email}</span>
                                                                    <Button variant="secondary" size="sm" onClick={() => handleUnblockUser(room, bu)}>
                                                                        <UserCheck className="mr-2 h-4 w-4"/>
                                                                        Re-admit
                                                                    </Button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    ) : <p className="text-muted-foreground">No users have been blocked.</p>}
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    )}

                                </div>
                            </li>
                        )
                    })}
                </ul>
            ) : (
                <p className="text-muted-foreground">No rooms in this category.</p>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Wifi /> Sync Online</CardTitle>
                    <CardDescription>Schedule a private room and invite others for a real-time, multi-language voice conversation.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Dialog open={isRoomDialogOpen} onOpenChange={setIsRoomDialogOpen}>
                        <DialogTrigger asChild>
                             <Button disabled={!user} onClick={handleOpenCreateDialog}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Schedule New Room
                            </Button>
                        </DialogTrigger>
                        {!user && <p className="text-sm text-muted-foreground mt-2">Please log in to create a room.</p>}

                        <DialogContent className="max-w-lg h-[90vh] flex flex-col">
                             <DialogHeader>
                                <DialogTitle>{isEditMode ? 'Edit' : 'Schedule'} a Sync Room</DialogTitle>
                                <DialogDescription>
                                    Set the details for your meeting. The cost will be calculated and displayed below.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex-grow overflow-hidden">
                                <ScrollArea className="h-full pr-6">
                                    <form id="create-room-form" onSubmit={handleSubmitRoom} className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="topic">Room Topic</Label>
                                            <Input id="topic" value={roomTopic} onChange={(e) => setRoomTopic(e.target.value)} placeholder="e.g., Planning our trip to Angkor Wat" required />
                                        </div>
                                            {!isEditMode && (
                                            <div className="space-y-2">
                                                <Label htmlFor="language">Your Spoken Language</Label>
                                                <Select onValueChange={(v) => setCreatorLanguage(v as AzureLanguageCode)} value={creatorLanguage} required>
                                                    <SelectTrigger id="language">
                                                        <SelectValue placeholder="Select language..." />
                                                    </SelectTrigger>
                                                    <SelectContent><ScrollArea className="h-72">{azureLanguages.map(lang => (<SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>))}</ScrollArea></SelectContent>
                                                </Select>
                                            </div>
                                        )}
                                       <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="duration">Duration (minutes)</Label>
                                                <Select onValueChange={(v) => setDuration(parseInt(v))} value={String(duration)}>
                                                    <SelectTrigger id="duration"><SelectValue /></SelectTrigger>
                                                    <SelectContent>{[15, 30, 45, 60].map(d => (<SelectItem key={d} value={String(d)}>{d} min</SelectItem>))}</SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Date & Time</Label>
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <Input
                                                            value={dateInput}
                                                            onChange={handleDateInputChange}
                                                            placeholder="e.g., 25 Dec 2024, 10:30 AM"
                                                            className="w-full justify-start text-left font-normal"
                                                        />
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0">
                                                        <Calendar mode="single" selected={scheduledDate} onSelect={setScheduledDate} initialFocus />
                                                        <div className="p-3 border-t border-border">
                                                            <Input type="time" defaultValue={scheduledDate && !isNaN(new Date(scheduledDate).getTime()) ? format(new Date(scheduledDate), 'HH:mm') : ''} onChange={e => {
                                                                const [hours, minutes] = e.target.value.split(':').map(Number);
                                                                setScheduledDate(d => {
                                                                    const newDate = d ? new Date(d) : new Date();
                                                                    newDate.setHours(hours, minutes);
                                                                    return newDate;
                                                                });
                                                            }}/>
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2">
                                            <Label htmlFor="invitees">Invite Emails (comma-separated)</Label>
                                            <Textarea id="invitees" value={inviteeEmails} onChange={(e) => setInviteeEmails(e.target.value)} placeholder="friend1@example.com, friend2@example.com" />
                                        </div>
                                        
                                        <div className="space-y-3">
                                            <Separator/>
                                            <Label className="font-semibold flex items-center gap-2"><Users className="h-5 w-5 text-primary"/> Participants ({allInvitedEmailsForCalc.length})</Label>
                                            <ScrollArea className="max-h-24"><div className="space-y-1 text-sm text-muted-foreground p-2 border rounded-md">
                                                {allInvitedEmailsForCalc.length > 0 ? (
                                                    allInvitedEmailsForCalc.map(email => (
                                                        <p key={email} className="truncate">{email} {email === user?.email && '(You)'}</p>
                                                    ))
                                                ) : (
                                                    <p>Just you so far!</p>
                                                )}
                                            </div></ScrollArea>
                                        </div>

                                        {allInvitedEmailsForCalc.length > 1 && (
                                            <div className="space-y-3">
                                                <Separator/>
                                                <Label className="font-semibold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/> Assign Emcees</Label>
                                                <ScrollArea className="max-h-32"><div className="space-y-2 pr-4">
                                                    {allInvitedEmailsForCalc.map(email => (
                                                        <div key={email} className="flex items-center space-x-2">
                                                            <Checkbox 
                                                                id={email} 
                                                                checked={emceeEmails.includes(email)} 
                                                                onCheckedChange={() => toggleEmcee(email)}
                                                                disabled={email === user?.email}
                                                            />
                                                            <Label htmlFor={email} className="font-normal w-full truncate">
                                                                {email} {email === user?.email && '(Creator)'}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </div></ScrollArea>
                                            </div>
                                        )}
                                        <div className="p-3 rounded-lg bg-muted text-sm space-y-2">
                                            {isEditMode ? (
                                                <>
                                                    <div className="flex justify-between"><span>Original Cost:</span> <span>{editingRoom?.initialCost || 0} tokens</span></div>
                                                    <div className="flex justify-between"><span>New Cost:</span> <span>{calculatedCost} tokens</span></div>
                                                    <Separator/>
                                                    <div className="flex justify-between font-bold">
                                                        <span>{costDifference >= 0 ? "Additional Charge:" : "Refund:"}</span>
                                                        <span className={costDifference >= 0 ? 'text-destructive' : 'text-green-600'}>{Math.abs(costDifference)} tokens</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="font-semibold">Total Estimated Cost: <strong className="text-primary">{calculatedCost} tokens</strong></p>
                                            )}
                                            
                                            <p className="text-xs text-muted-foreground">
                                                Based on {allInvitedEmailsForCalc.length} participant(s) for {duration} minutes.
                                            </p>
                                            <p className="text-xs text-muted-foreground">Your Balance: {userProfile?.tokenBalance || 0} tokens</p>
                                        </div>
                                    </form>
                                </ScrollArea>
                            </div>
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
                                 {(userProfile?.tokenBalance || 0) < costDifference ? (
                                    <div className="flex flex-col items-end gap-2">
                                        <p className="text-destructive text-sm font-semibold">Insufficient tokens.</p>
                                        <BuyTokens />
                                    </div>
                                ) : (
                                    <Button type="submit" form="create-room-form" disabled={isSubmitting}>
                                        {isSubmitting ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        {isSubmitting ? (isEditMode ? 'Saving...' : 'Scheduling...') : 
                                            isEditMode ? `Confirm & Pay ${costDifference > 0 ? costDifference : 0} Tokens` : `Confirm & Pay ${calculatedCost} Tokens`
                                        }
                                    </Button>
                                )}
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>

            {user && isClient && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><List /> Your Rooms</CardTitle>
                        <CardDescription>A list of all your active, scheduled, and summarized rooms.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {isFetchingRooms ? (
                             <div className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="animate-spin h-5 w-5" /><p>Fetching rooms...</p></div>
                        ) : (
                            <>
                                {renderRoomList(scheduled, 'Scheduled')}
                                {renderRoomList(activeAndInvited, 'Active & Invited')}
                                {renderRoomList(closedWithSummary, 'Closed with Summary')}
                            </>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
