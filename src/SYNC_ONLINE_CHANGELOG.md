# Sync Online Changelog

All notable changes to the Sync Online feature will be documented in this file.

## [Unreleased]

### Fixed
- **`[FIX]`** Resolved an infinite loop that occurred when an emcee ended a meeting. A state guard now prevents the component from repeatedly trying to exit, ensuring a clean navigation away from the closed room.
- **`[FIX]`** Resolved a persistent race condition on room entry that caused a "permission denied" error when listening for messages. The logic is now separated to ensure the message listener is only initialized *after* the user's participant status is confirmed, which also resolves the downstream WebChannel errors upon exit.
- **`[FIX]`** Corrected a `ReferenceError` for `where` not being defined by adding the proper import from `firebase/firestore`.
- **`[FIX]`** Prevented old messages from being loaded when a user joins or rejoins a room by querying for messages created after the user's join timestamp.
