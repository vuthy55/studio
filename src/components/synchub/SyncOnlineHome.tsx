

"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from '@/lib/firebase';
import { collection, serverTimestamp, setDoc, doc, query, where, getDocs, deleteDoc, writeBatch, getDocs as getSubCollectionDocs, updateDoc, arrayRemove, arrayUnion, limit } from 'firebase/firestore';
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
import { LoaderCircle, PlusCircle, Wifi, Copy, List, ArrowRight, Trash2, CheckSquare, ShieldCheck, XCircle, UserX, UserCheck, FileText, Edit, Save, Share2, Download, Settings, Languages as TranslateIcon, RefreshCw } from 'lucide-react';
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
import { updateRoomSummary, softDeleteRoom, permanentlyDeleteRooms, checkRoomActivity } from '@/actions/room';
import { summarizeRoom } from '@/ai/flows/summarize-room-flow';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { languages } from '@/lib/data';
import { translateSummary } from '@/ai/flows/translate-summary-flow';


interface InvitedRoom extends SyncRoom {
    id: string;
}

function RoomSummaryDialog({ room, user, onUpdate }: { room: InvitedRoom; user: any; onUpdate: () => void }) {
    const { toast } = useToast();
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

    const availableLanguages = useMemo(() => {
        if (!editableSummary) return [];
        const langSet = new Set<string>();
        editableSummary.presentParticipants.forEach(p => {
           const lang = languages.find(l => l.label === p.language);
           if(lang) langSet.add(lang.value);
        });
        editableSummary.absentParticipants.forEach(p => {
             const lang = languages.find(l => l.label === p.language);
           if(lang) langSet.add(lang.value);
        });
        return Array.from(langSet).map(value => languages.find(l => l.value === value)!);
    }, [editableSummary]);

    const formatDate = (dateString: string) => {
        if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            return "Unknown";
        }
        try {
            const date = new Date(dateString);
             if (isNaN(date.getTime())) {
                const parts = dateString.split('-').map(Number);
                const utcDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
                 if(isNaN(utcDate.getTime())) return "Unknown";
                 return utcDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
            }
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
        } catch (e) {
            return "Unknown";
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setEditableSummary(prev => prev ? { ...prev, [name]: value } : null);
    };
    
    const handleActionItemChange = (index: number, field: string, value: any) => {
        if (!editableSummary) return;
        const newActionItems = [...editableSummary.actionItems];
        (newActionItems[index] as any)[field] = value;
        setEditableSummary({ ...editableSummary, actionItems: newActionItems });
    };

    const addActionItem = () => {
        if (!editableSummary) return;
        const newActionItems = [...editableSummary.actionItems, { task: { original: '' }, personInCharge: '', dueDate: '' }];
        setEditableSummary({ ...editableSummary, actionItems: newActionItems });
    };

    const removeActionItem = (index: number) => {
        if (!editableSummary) return;
        const newActionItems = editableSummary.actionItems.filter((_, i) => i !== index);
        setEditableSummary({ ...editableSummary, actionItems: newActionItems });
    };

    const handleSaveChanges = async () => {
        if (!editableSummary) return;
        setIsSaving(true);
        try {
            const result = await updateRoomSummary(room.id, editableSummary);
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
        if (selectedLanguages.length === 0 || !editableSummary) {
            toast({ variant: 'destructive', title: 'No Languages Selected', description: 'Please select at least one language to translate to.' });
            return;
        }
        setIsTranslating(true);
        toast({ title: 'Translating Summary...', description: 'This may take a moment.' });
        try {
            const translated = await translateSummary({
                summary: editableSummary,
                targetLanguages: selectedLanguages
            });
            setEditableSummary(translated);
            await updateRoomSummary(room.id, translated);
            toast({ title: 'Success', description: 'Summary translated and saved.' });
            onUpdate();
        } catch (error) {
             console.error(error);
            toast({ variant: 'destructive', title: 'Translation Failed', description: 'Could not translate the summary.' });
        } finally {
            setIsTranslating(false);
            setSelectedLanguages([]);
        }
    }

    if (!editableSummary) return null;

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
                                onChange={(e) => setEditableSummary(prev => prev ? { ...prev, summary: { ...prev.summary, original: e.target.value } } : null)}
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
                                    <TableRow key={`action-${item.task.original}-${index}`}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>
                                            {isEditing ? (
                                                <Input value={item.task.original} onChange={(e) => handleActionItemChange(index, 'task', { ...item.task, original: e.target.value })} />
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
                                                <Input value={item.dueDate || ''} onChange={(e) => handleActionItemChange(index, 'dueDate', e.target.value)} />
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
                                            <TableRow key={`present-${p.email}-${i}`}>
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
                                            <TableRow key={`absent-${p.email}-${i}`}>
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
                                        <Button variant="secondary" disabled={isTranslating || availableLanguages.length < 2}>
                                            <TranslateIcon className="mr-2 h-4 w-4" /> Translate
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80">
                                        <div className="grid gap-4">
                                            <div className="space-y-2">
                                                <h4 className="font-medium leading-none">Translate Summary</h4>
                                                <p className="text-sm text-muted-foreground">Select languages to translate into.</p>
                                            </div>
                                            <div className="grid gap-2">
                                                {availableLanguages.map((lang) => (
                                                    <div key={lang.value} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`lang-${lang.value}`}
                                                            checked={selectedLanguages.includes(lang.value)}
                                                            onCheckedChange={(checked) => {
                                                                return checked
                                                                    ? setSelectedLanguages([...selectedLanguages, lang.value])
                                                                    : setSelectedLanguages(selectedLanguages.filter((l) => l !== lang.value));
                                                            }}
                                                        />
                                                        <Label htmlFor={`lang-${lang.value}`}>{lang.label}</Label>
                                                    </div>
                                                ))}
                                            </div>
                                            <Button onClick={handleTranslate} disabled={isTranslating || selectedLanguages.length === 0}>
                                                {isTranslating && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                                Confirm Translation
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            {isEmcee && <Button variant="secondary" onClick={() => setIsEditing(true)}><Edit className="mr-2 h-4 w-4"/> Edit</Button>}
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
        if (open && !hasCheckedActivity && room.status !== 'closed') {
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
        const toastId = toast({ title: 'Summarizing...', description: 'The AI is generating a meeting summary. This may take a moment.', duration: 120000 });
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
             if (toastId) dismiss(toastId.id);
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
                {isLoading && (
                    <div className="flex items-center justify-center h-24">
                        <LoaderCircle className="animate-spin" />
                    </div>
                )}
                
                {room.status === 'closed' && room.summary && (
                     <div className="py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">This room is closed. You can re-generate the summary if the previous one was incorrect.</p>
                         <Button onClick={handleSummarizeAndEnd} disabled={isActionLoading}>
                            <RefreshCw className="mr-2 h-4 w-4"/>
                            {isActionLoading ? 'Re-summarizing...' : 'Re-summarize & Overwrite'}
                        </Button>
                    </div>
                )}

                {hasCheckedActivity && !isLoading && room.status === 'active' && (
                    <div className="py-4 space-y-4">
                        {hasActivity ? (
                            <>
                                <p className="text-sm text-muted-foreground">This room has had meeting activity. You can close it for all users or generate a final summary.</p>
                                <div className="flex flex-col gap-2">
                                     <Button onClick={handleSoftDelete} disabled={isActionLoading} variant="destructive">
                                        {isActionLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                        Close Room
                                    </Button>
                                    <Button onClick={handleSummarizeAndEnd} disabled={isActionLoading}>
                                        {isActionLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin"/>}
                                        Summarize &amp; Close Room
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
    const [user, loading] = useAuthState(auth);
    const router = useRouter();
    const { toast } = useToast();

    const [isCreating, setIsCreating] = useState(false);
    const [roomTopic, setRoomTopic] = useState('');
    const [creatorLanguage, setCreatorLanguage] = useState<AzureLanguageCode | ''>('');
    const [inviteeEmails, setInviteeEmails] = useState('');
    const [emceeEmails, setEmceeEmails] = useState<string[]>([]);
    const [isCreateRoomDialogOpen, setIsCreateRoomDialogOpen] = useState(false);
    
    const [invitedRooms, setInvitedRooms] = useState<InvitedRoom[]>([]);
    const [isFetchingRooms, setIsFetchingRooms] = useState(true);

    const [isClient, setIsClient] = useState(false);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    
    const [currentlyManagedRoom, setCurrentlyManagedRoom] = useState<InvitedRoom | null>(null);

    useEffect(() => {
        setIsClient(true);
        if (user?.email && !emceeEmails.includes(user.email)) {
            setEmceeEmails([user.email]);
        }
        getAppSettingsAction().then(setSettings);
    }, [user, emceeEmails]);

    const parsedInviteeEmails = useMemo(() => {
        return inviteeEmails.split(/[ ,]+/).map(email => email.trim()).filter(Boolean);
    }, [inviteeEmails]);
    
     const toggleEmcee = (email: string) => {
        setEmceeEmails(prev => 
            prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
        );
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
                .map(doc => ({ id: doc.id, ...doc.data() } as InvitedRoom))
                // Keep active rooms OR closed rooms that have a summary
                .filter(room => room.status === 'active' || room.summary)
                .sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)); // Sort by newest first
            
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
    
    const resetAndClose = () => {
        setRoomTopic('');
        setCreatorLanguage('');
        setInviteeEmails('');
        setEmceeEmails(user?.email ? [user.email] : []);
        setIsCreateRoomDialogOpen(false);
    };

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !user.email) {
            toast({ variant: 'destructive', title: 'Not Logged In', description: 'You must be logged in to create a room.' });
            return;
        }
        if (!roomTopic || !creatorLanguage) {
            toast({ variant: 'destructive', title: 'Missing Information', description: 'Please provide a topic and select your language.' });
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
        
        setIsCreating(true);
        try {
            const batch = writeBatch(db);

            const newRoomRef = doc(collection(db, 'syncRooms'));
            const newRoom: Omit<SyncRoom, 'id'> = {
                topic: roomTopic,
                creatorUid: user.uid,
                creatorName: user.displayName || user.email?.split('@')[0] || 'Creator',
                createdAt: serverTimestamp(),
                status: 'active',
                invitedEmails: allInvitedEmails,
                emceeEmails: [...new Set(emceeEmails)],
                blockedUsers: [],
                lastActivityAt: serverTimestamp(),
            };
            batch.set(newRoomRef, newRoom);
            
            // Add creator as the first participant
            const participantRef = doc(db, 'syncRooms', newRoomRef.id, 'participants', user.uid);
            batch.set(participantRef, {
                uid: user.uid,
                name: user.displayName || user.email?.split('@')[0] || 'Creator',
                email: user.email!,
                selectedLanguage: creatorLanguage,
                isMuted: false,
                joinedAt: serverTimestamp()
            });


            await batch.commit();
            
            toast({ title: "Room Created!", description: "Your new room is available in the list below." });
            fetchInvitedRooms();
            resetAndClose();


        } catch (error) {
            console.error("Error creating room:", error);
            toast({ variant: "destructive", title: "error when i tried to create room" });
        } finally {
            setIsCreating(false);
        }
    };

    const handleUnblockUser = useCallback(async (room: InvitedRoom, userToUnblock: any) => {
        try {
            const roomRef = doc(db, 'syncRooms', room.id);
            await updateDoc(roomRef, {
                blockedUsers: arrayRemove(userToUnblock)
            });
            toast({ title: 'User Unblocked', description: 'The user can now rejoin the room.' });
            
            // Refresh the main room list to update its state globally
            setInvitedRooms(prevRooms => prevRooms.map(r => {
                if (r.id === room.id) {
                    return {
                        ...r,
                        blockedUsers: r.blockedUsers?.filter(u => u.uid !== userToUnblock.uid)
                    };
                }
                return r;
            }));

        } catch (error) {
            console.error('Error unblocking user:', error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not unblock the user.' });
        }
    }, []);

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

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Wifi /> Sync Online</CardTitle>
                    <CardDescription>Create a private room and invite others for a real-time, multi-language voice conversation.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Dialog open={isCreateRoomDialogOpen} onOpenChange={(open) => {
                        setIsCreateRoomDialogOpen(open);
                        if (!open) resetAndClose();
                     }}>
                        <DialogTrigger asChild>
                             <Button disabled={!user}>
                                <PlusCircle className="mr-2 h-4 w-4" />
                                Create New Room
                            </Button>
                        </DialogTrigger>
                        {!user && <p className="text-sm text-muted-foreground mt-2">Please log in to create a room.</p>}

                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>Create a Sync Room</DialogTitle>
                                <DialogDescription>
                                    Fill in the details below. Once created, you'll get a shareable link. The max number of users per room is {settings?.maxUsersPerRoom || 5}.
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleCreateRoom} className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="topic">Room Topic</Label>
                                    <Input id="topic" value={roomTopic} onChange={(e) => setRoomTopic(e.target.value)} placeholder="e.g., Planning our trip to Bali" required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="language">Your Spoken Language</Label>
                                    <Select onValueChange={(v) => setCreatorLanguage(v as AzureLanguageCode)} value={creatorLanguage} required>
                                        <SelectTrigger id="language">
                                            <SelectValue placeholder="Select your language..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <ScrollArea className="h-72">
                                            {azureLanguages.map(lang => (
                                                <SelectItem key={lang.value} value={lang.value}>{lang.label}</SelectItem>
                                            ))}
                                          </ScrollArea>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="invitees">Invite Emails (comma-separated)</Label>
                                    <Textarea id="invitees" value={inviteeEmails} onChange={(e) => setInviteeEmails(e.target.value)} placeholder="friend1@example.com, friend2@example.com" />
                                </div>

                                {(parsedInviteeEmails.length > 0 || user?.email) && (
                                    <div className="space-y-3">
                                        <Separator/>
                                        <Label className="font-semibold flex items-center gap-2">
                                            <ShieldCheck className="h-5 w-5 text-primary"/>
                                            Assign Emcees
                                        </Label>
                                        <ScrollArea className="max-h-32">
                                            <div className="space-y-2 pr-4">
                                                {user?.email && (
                                                     <div className="flex items-center space-x-2">
                                                        <Checkbox id={user.email} checked={emceeEmails.includes(user.email)} onCheckedChange={() => toggleEmcee(user.email)} />
                                                        <Label htmlFor={user.email} className="font-normal w-full truncate">{user.email} (Creator)</Label>
                                                    </div>
                                                )}
                                                {parsedInviteeEmails.map(email => (
                                                    <div key={email} className="flex items-center space-x-2">
                                                        <Checkbox id={email} checked={emceeEmails.includes(email)} onCheckedChange={() => toggleEmcee(email)} />
                                                        <Label htmlFor={email} className="font-normal w-full truncate">{email}</Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                        <Separator/>
                                    </div>
                                )}

                                <DialogFooter>
                                    <Button type="submit" disabled={isCreating}>
                                        {isCreating ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Create Room
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </CardContent>
            </Card>

            {user && isClient && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2"><List /> Your Invited Rooms</CardTitle>
                        <CardDescription>Rooms you have been invited to or have created.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isFetchingRooms ? (
                             <div className="flex items-center gap-2 text-muted-foreground">
                                <LoaderCircle className="animate-spin h-5 w-5" />
                                <p>Fetching invitations...</p>
                            </div>
                        ) : invitedRooms.length > 0 ? (
                            <ul className="space-y-3">
                                {invitedRooms.map(room => {
                                    const isBlocked = room.blockedUsers?.some(bu => bu.uid === user.uid);
                                    const isCreator = room.creatorUid === user.uid;

                                    return (
                                        <li key={room.id} className="flex justify-between items-center p-3 bg-secondary rounded-lg gap-2">
                                            <div className="flex-grow">
                                                <p className="font-semibold">{room.topic}</p>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm text-muted-foreground">{room.createdAt ? new Date((room.createdAt as any).toDate()).toLocaleString() : ''}</p>
                                                    {room.status === 'closed' && (
                                                        <Badge variant={room.summary ? 'default' : 'destructive'}>
                                                            {room.summary ? 'Summary Available' : 'Closed'}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {isBlocked ? (
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
                                                ) : null}

                                                {room.status === 'active' && (
                                                    <Button asChild disabled={isBlocked}>
                                                        <Link href={`/sync-room/${room.id}`}>Join Room</Link>
                                                    </Button>
                                                )}

                                                {room.summary && (
                                                    <RoomSummaryDialog room={room} user={user} onUpdate={fetchInvitedRooms} />
                                                )}
                                                
                                                {isCreator && (
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
                                                                    You can re-admit users who were previously removed from this room.
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
                                                                ) : <p className="text-muted-foreground">No users have been blocked from this room.</p>}
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
                            <p className="text-muted-foreground">You have no active room invitations.</p>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
