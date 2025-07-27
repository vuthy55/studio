
import admin from 'firebase-admin';

// Check if the required environment variables are set.
// This provides a clear error message if the developer hasn't configured them.
if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error("FIREBASE_ADMIN_* environment variables not set.");
    console.error("Please ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are in your .env.local file.");
    // In a real production environment, you might want to throw an error here.
    // For now, we'll log an error and let the app continue, though it will fail on server-side operations.
}


if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // The replace is crucial for parsing the key from the .env file
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
        });
         console.log("[FIREBASE ADMIN] Firebase Admin SDK initialized successfully.");
    } catch (error: any) {
        console.error('[FIREBASE ADMIN] CRITICAL: Firebase admin initialization error. Check your environment variables and that your service account file is correct.', error.stack);
    }
}

const db = admin.firestore();
const auth = admin.auth();


export { db, auth };
