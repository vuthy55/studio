// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase for SSR
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);


// Enable offline persistence
// NOTE: This is wrapped in a try/catch block because it can fail if multiple tabs are open.
// It also checks for window to ensure it only runs on the client-side.
if (typeof window !== 'undefined') {
    try {
        enableIndexedDbPersistence(db)
            .catch((err) => {
                if (err.code == 'failed-precondition') {
                    // Multiple tabs open, persistence can only be enabled
                    // in one tab at a time.
                    console.warn('Firebase persistence failed, multiple tabs open?');
                } else if (err.code == 'unimplemented') {
                    // The current browser does not support all of the
                    // features required to enable persistence
                    console.warn('Firebase persistence is not available in this browser.');
                }
            });
    } catch (e) {
        console.error("Error enabling Firestore persistence:", e)
    }
}


// Connect to emulators in development
if (process.env.NODE_ENV === 'development') {
    // console.log("Connecting to Firebase Emulators");
    // connectAuthEmulator(auth, "http://localhost:9099");
    // connectFirestoreEmulator(db, "localhost", 8080);
    // connectStorageEmulator(storage, "localhost", 9199);
}

export { app, db, auth, storage };
