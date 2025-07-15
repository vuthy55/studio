
import { useEffect, useState } from 'react';
import { doc, onSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export function useUser(uid: string | undefined) {
  const [profile, setProfile] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      setProfile(null);
      return;
    }

    setLoading(true);
    const userDocRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        setProfile(doc.data());
      } else {
        setProfile(null);
      }
      setLoading(false);
    }, (error) => {
        console.error("Error fetching user profile:", error);
        setProfile(null);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  return { profile, loading };
}
