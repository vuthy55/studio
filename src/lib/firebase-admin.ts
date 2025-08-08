
import admin from 'firebase-admin';

// This check provides a clear error message if the developer hasn't configured the .env.local file.
if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error("FIREBASE_ADMIN_* environment variables not set.");
    console.error("Please ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are in your .env file.");
}


if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // The replace is crucial for parsing the key from the .env file
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            })
        });
    } catch (error: any) {
        console.error('[FIREBASE ADMIN] CRITICAL: Firebase admin initialization error. Check environment variables.', error.stack);
    }
}

const db = admin.firestore();
const auth = admin.auth();


export { db, auth };
