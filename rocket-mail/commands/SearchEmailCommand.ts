import {
    IHttp,
    IModify,
    IRead,
    IPersistence,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../RocketMailApp";
import { EmailServiceFactory } from "../services/EmailServiceFactory";
import { IEmailSearchParams } from "../models/LLMTask";

export class SearchEmailCommand {
    constructor(private readonly app: RocketMailApp) {}

    public async execute(
        args: Array<string>,
        sender,
        room,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        if (args.length === 0) {
            messageBuilder.setText(
                "Usage: /rocket-mail search [subject:Subject] [from:Sender] [body:Text] [since:YYYY-MM-DD] [until:YYYY-MM-DD] [limit:Number]"
            );
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        // Parse search parameters
        const searchParams: IEmailSearchParams = {};
        
        for (const arg of args) {
            if (arg.startsWith("subject:")) {
                searchParams.subject = arg.substring(8).trim();
            } else if (arg.startsWith("from:")) {
                searchParams.sender = arg.substring(5).trim();
            } else if (arg.startsWith("body:")) {
                searchParams.body = arg.substring(5).trim();
            } else if (arg.startsWith("since:")) {
                searchParams.startDate = arg.substring(6).trim();
            } else if (arg.startsWith("until:")) {
                searchParams.endDate = arg.substring(6).trim();
            } else if (arg.startsWith("limit:")) {
                const limitStr = arg.substring(6).trim();
                const limit = parseInt(limitStr);
                if (!isNaN(limit) && limit > 0) {
                    searchParams.limit = limit;
                }
            } else if (!searchParams.body) {
                // If no specific parameter is provided, treat as body search
                searchParams.body = arg;
            }
        }

        // Set a default limit if not specified
        if (!searchParams.limit) {
            searchParams.limit = 10;
        }
        
        messageBuilder.setText("🔍 Searching emails. Please wait...");
        await modify.getCreator().finish(messageBuilder);

        try {
            const settings = await getEmailSettings(
                read.getEnvironmentReader().getSettings()
            );
            
            try {
                // Create the appropriate email service
                const emailService = await EmailServiceFactory.createEmailService(
                    settings,
                    sender.id,
                    this.app.getLogger(),
                    http,
                    read,
                    persistence
                );

                // Search emails
                const emails = await emailService.searchEmails(searchParams);
                
                const resultMessageBuilder = modify
                    .getCreator()
                    .startMessage()
                    .setSender(sender)
                    .setRoom(room);

                if (emails.length === 0) {
                    resultMessageBuilder.setText("No emails found matching your search criteria.");
                } else {
                    let resultText = `📋 **Search Results** (${emails.length} email${emails.length === 1 ? '' : 's'} found)\n\n`;
                    
                    for (const email of emails) {
                        resultText += `**From**: ${email.from}\n`;
                        resultText += `**Date**: ${email.date}\n`;
                        resultText += `**Subject**: ${email.subject}\n`;
                        resultText += `**ID**: ${email.id}\n\n`;
                    }
                    
                    resultText += `To view a specific email, use: \`/rocket-mail view <email_id>\``;
                    resultMessageBuilder.setText(resultText);
                }
                
                await modify.getCreator().finish(resultMessageBuilder);
            } catch (error) {
                // Check if this is an authentication error
                if (error.message && error.message.includes("not authenticated")) {
                    const authErrorMessage = modify
                        .getCreator()
                        .startMessage()
                        .setSender(sender)
                        .setRoom(room);
                    
                    authErrorMessage.setText(`🔒 ${error.message}`);
                    await modify.getCreator().finish(authErrorMessage);
                } else {
                    throw error;
                }
            }
        } catch (error) {
            this.app.getLogger().error("Error searching emails:", error);
            
            const errorMessage = modify
                .getCreator()
                .startMessage()
                .setSender(sender)
                .setRoom(room);
            
            errorMessage.setText(`❌ Error searching emails: ${error.message}`);
            await modify.getCreator().finish(errorMessage);
        }
    }
}
