# Sync Online Changelog

All notable changes to the Sync Online feature will be documented in this file.

## [Unreleased]

### Fixed
- **`[FIX]`** Resolved a persistent `FirebaseError: Missing or insufficient permissions` that occurred on the Admin > Audio Packs page and the SyncHub > Prep Your Vibe > Offline Manager. The root cause was identified as an incorrect architectural pattern where client-side components were attempting to directly query a protected Firestore collection (`audioPacks`). The fix involved removing all direct client-side `onSnapshot` and `getDocs` calls to this collection and refactoring the components to exclusively use a secure server action (`getAudioPacks`) for all data fetching. This enforces the correct security model where sensitive data is only accessed through the trusted server environment.
- **`[FIX]`** Implemented a server-side retry mechanism for the audio pack generation feature. The system will now automatically attempt to generate audio for a phrase up to three times if it encounters a transient error, logging the final error reason only if all attempts fail. This makes the feature more resilient to temporary network or service issues.
- **`[FIX]`** Corrected a data serialization issue where Firestore `Timestamp` objects were being sent directly to the client from a server action, causing a runtime error. The server action now correctly converts all timestamps to ISO strings before transmission.
- **`[FIX]`** Resolved a race condition where the Profile page would display empty fields for `country` and `language` after login, even when data existed in Firestore. The component's local state was initializing with empty data before the user's profile was fully loaded from the central `UserDataContext`. The fix eliminated the problematic local state and now binds the form fields directly to the `UserDataContext`, ensuring the UI is always a direct reflection of the central data store.
- **`[FIX]`** Resolved a persistent `FirebaseError: Missing or insufficient permissions` error that occurred upon user logout. The root cause was a race condition where data-fetching hooks (`fetchUserProfile`) were called after the user's authentication state was cleared but before the component tree fully updated. The fix involved centralizing logout logic in the `UserDataContext` and implementing a state guard to immediately and synchronously block any user-specific data fetches the moment a logout is initiated.
- **`[FIX]`** Resolved an infinite loop that occurred when an emcee ended a meeting. A state guard now prevents the component from repeatedly trying to exit, ensuring a clean navigation away from the closed room.
- **`[FIX]`** Resolved a persistent race condition on room entry that caused a "permission denied" error when listening for messages. The logic is now separated to ensure the message listener is only initialized *after* the user's participant status is confirmed, which also resolves the downstream WebChannel errors upon exit.
- **`[FIX]`** Corrected a `ReferenceError` for `where` not being defined by adding the proper import from `firebase/firestore`.
- **`[FIX]`** Prevented old messages from being loaded when a user joins or rejoins a room by querying for messages created after the user's join timestamp.


