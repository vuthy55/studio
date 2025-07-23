# Sync Online Changelog

All notable changes to the Sync Online feature will be documented in this file.

## [Unreleased]

### Fixed
- **`[FIX]`** Resolved a race condition on room entry that caused a "permission denied" error when listening for messages. The message listener is now correctly initialized only after the user has successfully joined as a participant. This also fixes the downstream WebChannel errors when exiting the room.
- **`[FIX]`** Corrected a `ReferenceError` for `where` not being defined by adding the proper import from `firebase/firestore`.
- **`[FIX]`** Prevented old messages from being loaded when a user joins or rejoins a room by querying for messages created after the user's join timestamp.
