import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../../RocketMailApp";
import { EmailServiceFactory } from "../email-providers/EmailServiceFactory";
import { IEmailSearchParams } from "../models/LLMTask";

export async function searchEmails({
    params,
    sender,
    room,
    read,
    modify,
    http,
    persistence,
    app
}: {
    params: IEmailSearchParams;
    sender: any;
    room: any;
    read: IRead;
    modify: IModify;
    http: IHttp;
    persistence: IPersistence;
    app: RocketMailApp;
}): Promise<{ success: boolean; message: string; data?: any }> {
    if (!params) {
        return {
            success: false,
            message: "No search parameters provided"
        };
    }

    // Set a default limit if not specified
    if (!params.limit) {
        params.limit = 10;
    }

    try {
        const settings = await getEmailSettings(
            read.getEnvironmentReader().getSettings()
        );

        // Create the appropriate email service
        const emailService = await EmailServiceFactory.createEmailService(
            settings,
            sender.id,
            app.getLogger(),
            http,
            read,
            persistence
        );

        // Search emails
        const emails = await emailService.searchEmails(params);

        if (emails.length === 0) {
            return {
                success: true,
                message: "No emails found matching your search criteria.",
                data: []
            };
        }

        let resultText = `📋 **Search Results** (${emails.length} email${emails.length === 1 ? '' : 's'} found)\n\n`;

        for (const email of emails) {
            resultText += `**From**: ${email.from}\n`;
            resultText += `**Date**: ${email.date}\n`;
            resultText += `**Subject**: ${email.subject}\n`;
            resultText += `**ID**: ${email.id}\n\n`;
        }

        resultText += `To view a specific email, use: \`/rocket-mail view <email_id>\` or ask me to "show email ${emails[0].id}"`;

        return {
            success: true,
            message: resultText,
            data: emails
        };
    } catch (error) {
        app.getLogger().error("Error searching emails:", error);
        
        if (error.message && error.message.includes("not authenticated")) {
            return {
                success: false,
                message: `🔒 ${error.message} - Please use /rocket-mail login to authenticate first.`
            };
        }
        
        return {
            success: false,
            message: `❌ Error searching emails: ${error.message}`
        };
    }
}
