
'use client';

export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

// A custom error to provide more context for Firestore permission errors.
export class FirestorePermissionError extends Error {
  context: SecurityRuleContext;
  serverError: any;

  constructor(context: SecurityRuleContext, serverError?: any) {
    const jsonContext = JSON.stringify(context, null, 2);
    const message = `FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:\n${jsonContext}`;
    
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;
    this.serverError = serverError;

    // This is for environments that support it (like Node.js)
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, FirestorePermissionError);
    }
  }
}
