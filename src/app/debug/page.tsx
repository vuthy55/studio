
"use client";

import React, { useState, Suspense } from 'react';
import { useUserData } from '@/context/UserDataContext';
import { useRouter } from 'next/navigation';
import MainHeader from '@/components/layout/MainHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoaderCircle, AlertTriangle, Server, Monitor, CheckCircle2, XCircle } from 'lucide-react';
import { getPayPalDebugInfo } from '@/actions/debug';

interface DebugInfo {
  client_paypal_client_id_sandbox: string | null;
  server_node_env: string;
  server_paypal_client_id_sandbox: string | null;
  server_paypal_client_secret_sandbox: string | null;
  accessTokenResult: {
    accessToken?: string;
    error?: string;
  };
}

function DebugPageContent() {
    const { user, loading: authLoading } = useUserData();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);

    if (!authLoading && !user) {
        router.push('/login');
        return null;
    }

    const runDiagnostics = async () => {
        setIsLoading(true);
        setDebugInfo(null);
        try {
            const serverInfo = await getPayPalDebugInfo();
            const clientInfo = {
                client_paypal_client_id_sandbox: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX || null,
            };
            setDebugInfo({ ...clientInfo, ...serverInfo });
        } catch (error: any) {
            console.error("Diagnostic error:", error);
            alert(`An error occurred while running diagnostics: ${error.message}`);
        }
        setIsLoading(false);
    };

    const renderCheck = (condition: boolean) => {
        return condition
            ? <CheckCircle2 className="h-5 w-5 text-green-500" />
            : <XCircle className="h-5 w-5 text-destructive" />;
    };

    const isMatch = debugInfo && debugInfo.client_paypal_client_id_sandbox === debugInfo.server_paypal_client_id_sandbox;

    return (
        <div className="space-y-8">
            <MainHeader title="PayPal Debugger" description="Run diagnostics to check environment variables and API connectivity." />
            <Card>
                <CardHeader>
                    <CardTitle>PayPal Sandbox Diagnostics</CardTitle>
                    <CardDescription>
                        Click the button to fetch configuration values from both the client and server to diagnose authentication issues.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={runDiagnostics} disabled={isLoading}>
                        {isLoading ? <LoaderCircle className="mr-2 animate-spin" /> : <AlertTriangle className="mr-2" />}
                        Run Diagnostics
                    </Button>

                    {debugInfo && (
                        <div className="mt-6 space-y-4 font-mono text-sm">
                            <h3 className="text-lg font-sans font-semibold">Diagnostic Report</h3>
                            
                            <div className="p-4 border rounded-lg space-y-2">
                                <h4 className="font-sans font-medium flex items-center gap-2"><Monitor/> Client-Side State</h4>
                                <p><strong>NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX:</strong> {debugInfo.client_paypal_client_id_sandbox || <span className="text-destructive">NOT FOUND</span>}</p>
                            </div>

                            <div className="p-4 border rounded-lg space-y-2">
                                <h4 className="font-sans font-medium flex items-center gap-2"><Server/> Server-Side State</h4>
                                <p><strong>NODE_ENV:</strong> {debugInfo.server_node_env}</p>
                                <p><strong>NEXT_PUBLIC_PAYPAL_CLIENT_ID_SANDBOX:</strong> {debugInfo.server_paypal_client_id_sandbox || <span className="text-destructive">NOT FOUND</span>}</p>
                                <p><strong>PAYPAL_CLIENT_SECRET_SANDBOX:</strong> {debugInfo.server_paypal_client_secret_sandbox || <span className="text-destructive">NOT FOUND</span>}</p>
                            </div>
                            
                            <div className="p-4 border rounded-lg space-y-2">
                                <h4 className="font-sans font-medium">Analysis</h4>
                                <div className="flex items-center gap-2"><strong>Client ID Match:</strong> {renderCheck(!!isMatch)} {isMatch ? 'OK' : <span className="text-destructive font-semibold">MISMATCH</span>}</div>
                                <div className="flex items-center gap-2"><strong>Server Secret Loaded:</strong> {renderCheck(!!debugInfo.server_paypal_client_secret_sandbox)}</div>
                                <div className="flex items-center gap-2">
                                    <strong>Access Token Request:</strong> {renderCheck(!!debugInfo.accessTokenResult.accessToken)}
                                    {debugInfo.accessTokenResult.error && <p className="text-destructive">{debugInfo.accessTokenResult.error}</p>}
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function DebugPage() {
    return (
        <Suspense fallback={<div className="flex justify-center items-center h-[calc(100vh-8rem)]"><LoaderCircle className="h-10 w-10 animate-spin text-primary" /></div>}>
            <DebugPageContent />
        </Suspense>
    );
}
