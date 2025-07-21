
import admin from 'firebase-admin';

// This check provides a clear error message if the developer hasn't configured the .env.local file.
if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.error("FIREBASE_ADMIN_* environment variables not set.");
    console.error("Please ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are in your .env file.");
}


if (!admin.apps.length) {
    console.log("Attempting to initialize Firebase Admin SDK...");
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // The replace is crucial for parsing the key from the .env file
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            })
        });
        console.log("Firebase Admin SDK initialized successfully.");
    } catch (error: any) {
        console.error('CRITICAL: Firebase admin initialization error. Check your environment variables and private key format.', error.stack);
    }
} else {
    console.log("Firebase Admin SDK already initialized.");
}

let db, auth;

try {
    db = admin.firestore();
    auth = admin.auth();
} catch (error) {
    console.error("CRITICAL: Failed to get Firestore or Auth instance from initialized Admin SDK.", error);
    // Set them to null or a mock object to prevent crashes, although server actions will fail.
    db = null;
    auth = null;
}


export { db, auth };
