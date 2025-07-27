
import admin from 'firebase-admin';

// This new check ensures the service account file is referenced.
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("GOOGLE_APPLICATION_CREDENTIALS environment variable not set.");
    console.error("Please ensure GOOGLE_APPLICATION_CREDENTIALS is in your .env file and points to your service-account.json.");
}


if (!admin.apps.length) {
    console.log("[FIREBASE ADMIN] Attempting to initialize Firebase Admin SDK...");
    try {
        // The Admin SDK will automatically use the GOOGLE_APPLICATION_CREDENTIALS env var.
        admin.initializeApp();
        console.log("[FIREBASE ADMIN] Firebase Admin SDK initialized successfully.");
    } catch (error: any)
        {
        console.error('[FIREBASE ADMIN] CRITICAL: Firebase admin initialization error. Check your environment variables and that your service account file is correct.', error.stack);
    }
} else {
    console.log("[FIREBASE ADMIN] Firebase Admin SDK already initialized.");
}

const db = admin.firestore();
const auth = admin.auth();


export { db, auth };
