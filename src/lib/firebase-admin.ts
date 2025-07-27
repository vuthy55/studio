
import admin from 'firebase-admin';

// This is a more robust check to ensure all required environment variables for the Admin SDK are present.
const requiredEnvVars = [
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    const message = `[FIREBASE ADMIN] CRITICAL ERROR: The following environment variables are missing: ${missingEnvVars.join(', ')}. The Admin SDK cannot be initialized. Please check your .env.local file.`;
    console.error(message);
    // In a development environment, we throw an error to halt execution.
    // In production, this would cause the server to fail to start, which is intended behavior
    // as the Admin SDK is critical for server-side operations.
    if (process.env.NODE_ENV === 'development') {
        throw new Error(message);
    }
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
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
         console.log("[FIREBASE ADMIN] Firebase Admin SDK initialized successfully.");
    } catch (error: any) {
        console.error('[FIREBASE ADMIN] CRITICAL: Firebase admin initialization error. Check your environment variables and service account details.', error.stack);
         if (process.env.NODE_ENV === 'development') {
            throw error;
        }
    }
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();


export { db, auth, storage };
