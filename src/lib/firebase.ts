
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, persistentSingleTabManager } from "firebase/firestore";
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

// Initialize Firestore with modern offline persistence
const db = initializeFirestore(app, {
  cache: persistentSingleTabManager(),
});


const auth = getAuth(app);
const storage = getStorage(app);

// Connect to emulators in development
if (process.env.NODE_ENV === 'development') {
    // console.log("Connecting to Firebase Emulators");
    // connectAuthEmulator(auth, "http://localhost:9099");
    // connectFirestoreEmulator(db, "localhost", 8080);
    // connectStorageEmulator(storage, "localhost", 9199);
}

export { app, db, auth, storage };

