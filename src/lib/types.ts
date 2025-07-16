
import type { Timestamp } from "firebase/firestore";

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  avatarUrl: string;
  isAdmin: boolean;
  createdAt: Timestamp;
}
