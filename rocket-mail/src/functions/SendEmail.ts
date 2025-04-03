import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../../RocketMailApp";
import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";
import { IEmailSendParams } from "../models/LLMTask";
import { IEmailContent } from "../types/interfaces/IEmailService";

/**
 * Sends an email based on parameters extracted by LLM
 */
export async function sendEmail({
    params,
    sender,
    room,
    read,
    modify,
    http,
    persistence,
    app
}: {
    params: IEmailSendParams;
    sender: any;
    room: any;
    read: IRead;
    modify: IModify;
    http: IHttp;
    persistence: IPersistence;
    app: RocketMailApp;
}): Promise<{ success: boolean; message: string }> {
    if (!params.to || !params.to.length || !params.subject || !params.body) {
        return {
            success: false,
            message: "Missing required parameters for sending email. Please provide recipient, subject, and message content."
        };
    }

    try {
        const settings = await getEmailSettings(
            read.getEnvironmentReader().getSettings()
        );

        // Create the email service using the factory
        const emailService = await EmailServiceFactory.createEmailService(
            settings,
            sender.id,
            app.getLogger(),
            http,
            read,
            persistence
        );

        // Format recipient(s) as a comma-separated string
        const recipients = Array.isArray(params.to) ? params.to : [params.to];
        const recipientStr = recipients.join(', ');

        // Create email content object (only use properties defined in IEmailContent)
        const emailContent: IEmailContent = {
            from: settings.email,
            to: recipientStr,
            subject: params.subject,
            text: params.body,
            html: params.html
        };

        // If CC recipients are provided, append them to the "to" field for now
        // Note: This is a workaround since the IEmailContent interface doesn't support CC
        if (params.cc && params.cc.length > 0) {
            const ccStr = Array.isArray(params.cc) ? params.cc.join(', ') : params.cc;
            if (ccStr) {
                app.getLogger().debug(`Including CC recipients: ${ccStr}`);
                emailContent.to += `, ${ccStr}`;
            }
        }

        // Send the email
        await emailService.sendEmail(emailContent);

        const ccMessage = params.cc && params.cc.length > 0 
            ? ` (CC: ${Array.isArray(params.cc) ? params.cc.join(', ') : params.cc})`
            : '';

        return {
            success: true,
            message: `✅ Email sent successfully to ${recipientStr}${ccMessage} with subject "${params.subject}"`
        };
    } catch (error) {
        app.getLogger().error("Error sending email:", error);
        
        if (error.message && error.message.includes("not authenticated")) {
            return {
                success: false,
                message: `🔒 ${error.message} - Please use /rocket-mail login to authenticate first.`
            };
        }
        
        return {
            success: false,
            message: `❌ Error sending email: ${error.message}`
        };
    }
}
