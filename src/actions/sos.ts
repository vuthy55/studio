
'use server';

import Twilio from 'twilio';

interface SendSosPayload {
    to: string;
    name: string;
    location: {
        latitude: number;
        longitude: number;
    };
}

export async function sendSos(payload: SendSosPayload): Promise<{ success: boolean; error?: string }> {
    const { to, name, location } = payload;
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromPhone) {
        console.error("Twilio credentials are not configured on the server.");
        return { success: false, error: 'The SOS feature is not configured on the server.' };
    }

    if (!to) {
        return { success: false, error: 'No emergency contact phone number provided.' };
    }
    
    try {
        const client = Twilio(accountSid, authToken);

        const mapsLink = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;

        const messageBody = `VibeSync Emergency SOS from ${name}. I am in an emergency. My current location is: ${mapsLink}`;

        const message = await client.messages.create({
            body: messageBody,
            from: fromPhone,
            to: to
        });
        
        console.log(`SOS message sent successfully. SID: ${message.sid}`);
        return { success: true };

    } catch (error: any) {
        console.error("Error sending SOS via Twilio:", error);
        // Provide a more user-friendly error message
        let errorMessage = 'An unexpected error occurred while sending the SOS message.';
        if (error.code === 21211) { // Twilio error code for invalid 'To' number
            errorMessage = 'The emergency contact phone number is invalid. Please check the number in your profile.';
        } else if (error.code === 21614) { // Twilio error for non-geographically capable number
             errorMessage = 'This number cannot receive SMS messages. Please use a different emergency contact number.';
        }

        return { success: false, error: errorMessage };
    }
}
