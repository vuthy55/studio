
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useDocumentData } from 'react-firebase-hooks/firestore';
import { collection, doc, orderBy, query, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Vibe, VibePost } from '@/lib/types';
import { ArrowLeft, LoaderCircle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { postReply } from '@/actions/common-room';

export default function VibeDetailClient({ vibeId }: { vibeId: string }) {
    const { user, loading: userLoading } = useUserData();
    const { toast } = useToast();
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const [vibeData, vibeLoading, vibeError] = useDocumentData(doc(db, 'vibes', vibeId));
    const [posts, setPosts] = useState<VibePost[]>([]);
    const [postsLoading, setPostsLoading] = useState(true);
    const [replyContent, setReplyContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const postsQuery = query(collection(db, `vibes/${vibeId}/posts`), orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(postsQuery, (snapshot) => {
            const postsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VibePost));
            setPosts(postsData);
            setPostsLoading(false);
        }, (error) => {
            console.error("Error fetching posts:", error);
            setPostsLoading(false);
        });

        return () => unsubscribe();
    }, [vibeId]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [posts]);

    const handlePostReply = async () => {
        if (!replyContent.trim() || !user || !user.displayName) return;
        setIsSubmitting(true);
        try {
            await postReply(vibeId, replyContent, { uid: user.uid, name: user.displayName });
            setReplyContent('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to post reply.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (userLoading || vibeLoading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
                <LoaderCircle className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }
    
    if (vibeError) {
        return <p className="text-destructive">Error loading Vibe: {vibeError.message}</p>
    }

    if (!vibeData) {
        return <p>Vibe not found.</p>
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            <header className="p-4 border-b">
                <Button variant="ghost" asChild>
                    <Link href="/common-room">
                        <ArrowLeft className="mr-2 h-4 w-4"/>
                        Back to Common Room
                    </Link>
                </Button>
                <h1 className="text-2xl font-bold mt-2">{vibeData.topic}</h1>
                <p className="text-sm text-muted-foreground">Started by {vibeData.creatorName}</p>
            </header>

            <div className="flex-grow overflow-y-auto p-4 space-y-6">
                {postsLoading ? (
                    <LoaderCircle className="animate-spin mx-auto"/>
                ) : (
                    posts.map(post => (
                        <div key={post.id} className="flex items-start gap-4">
                            <Avatar>
                                <AvatarFallback>{post.authorName?.charAt(0) || 'U'}</AvatarFallback>
                            </Avatar>
                            <div className="flex-grow">
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold">{post.authorName}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {post.createdAt ? formatDistanceToNow(post.createdAt.toDate(), { addSuffix: true }) : ''}
                                    </p>
                                </div>
                                <p className="text-foreground whitespace-pre-wrap">{post.content}</p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <footer className="p-4 border-t bg-background">
                <div className="flex items-start gap-2">
                    <Textarea 
                        placeholder="Type your message here..." 
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        className="flex-grow"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handlePostReply();
                            }
                        }}
                    />
                    <Button onClick={handlePostReply} disabled={isSubmitting || !replyContent.trim()}>
                        <Send className="h-4 w-4"/>
                    </Button>
                </div>
            </footer>
        </div>
    );
}
