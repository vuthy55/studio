
import admin from 'firebase-admin';
import { cookies } from 'next/headers';

// This is the session cookie name that Next.js Auth uses
// You can find it in the Next.js Auth documentation
const SESSION_COOKIE_NAME = '__session';

if (!admin.apps.length) {
  // If you are using firebase-admin in a server-side context,
  // you can initialize it with a service account
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)),
    });
  } else {
    // Or, you can initialize it with the default credentials
    // This is useful for local development with the Firebase Emulator Suite
    admin.initializeApp();
  }
}

export async function getCurrentUser() {
  const sessionCookie = cookies().get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const decodedIdToken = await admin.auth().verifySessionCookie(sessionCookie, true);
    return decodedIdToken;
  } catch (error) {
    console.error('Error verifying session cookie:', error);
    return null;
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
