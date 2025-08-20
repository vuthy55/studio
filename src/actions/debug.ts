'use server';

import { getAccessToken } from './paypal';

interface PayPalDebugInfo {
  server_node_env: string;
  server_paypal_client_id_sandbox: string | null;
  server_paypal_client_secret_sandbox: string | null;
  accessTokenResult: {
    accessToken?: string;
    error?: string;
  };
}

/**
 * Safely retrieves server-side PayPal configuration and attempts to get an access token.
 * This function is for debugging purposes only.
 * @returns {Promise<PayPalDebugInfo>} An object containing debug information.
 */
export async function getPayPalDebugInfo(): Promise<PayPalDebugInfo> {
  const secret = process.env.PAYPAL_CLIENT_SECRET_SANDBOX;
  const sanitizedSecret = secret ? `Exists (Starts: ${secret.slice(0, 4)}, Ends: ${secret.slice(-4)})` : null;

  const accessTokenResult = await getAccessToken();

  return {
    server_node_env: process.env.NODE_ENV || 'Not Set',
    server_paypal_client_id_sandbox: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX || null,
    server_paypal_client_secret_sandbox: sanitizedSecret,
    accessTokenResult: accessTokenResult,
  };
}
