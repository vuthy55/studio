'use server';

import { processNewUserAndReferral, NewUserPayload } from './referrals';

/**
 * This server action acts as a safe entry point for the client to call the user creation process.
 * The client calls this function, and this function, which runs securely on the server,
 * then calls the more complex `processNewUserAndReferral` function.
 * This prevents any server-only code from being bundled with the client-side application.
 */
export async function signUpUser(
  userData: NewUserPayload,
  referrerUid?: string | null
): Promise<{success: boolean; error?: string; user?: {uid: string, email: string | null, name: string | null} }> {
  console.log(`[AUTH ACTION] signUpUser: Triggered for new user ${userData.email} with referrer ${referrerUid || 'None'}`);
  
  try {
    const result = await processNewUserAndReferral(userData, referrerUid);
    
    if (result.success) {
      console.log(`[AUTH ACTION] signUpUser: Successfully processed user ${userData.email}. Returning success to client.`);
    } else {
      console.error(`[AUTH ACTION] signUpUser: processNewUserAndReferral failed for ${userData.email}. Error: ${result.error}`);
    }
    
    return result;

  } catch (error: any) {
    console.error(`[AUTH ACTION] signUpUser: CRITICAL UNHANDLED EXCEPTION for ${userData.email}. Error: ${error.message}`);
    // This is a fallback catch, the main error handling is inside processNewUserAndReferral
    return { success: false, error: error.message || 'An unexpected server error occurred in the auth action.' };
  }
}
