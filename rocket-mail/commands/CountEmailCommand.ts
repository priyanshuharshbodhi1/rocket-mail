import {
    IHttp,
    IModify,
    IRead,
    IPersistence,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../RocketMailApp";
import { EmailServiceFactory } from "../services/EmailServiceFactory";
import { IEmailCountParams } from "../models/LLMTask";

export class CountEmailCommand {
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
                "Usage: /rocket-mail count [from:Sender] [since:YYYY-MM-DD] [until:YYYY-MM-DD]"
            );
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        // Parse count parameters
        const countParams: IEmailCountParams = {
            startDate: '',  // Required field, will set default below
            endDate: ''     // Required field, will set default below
        };
        
        try {
            for (const arg of args) {
                if (arg.startsWith("from:")) {
                    countParams.sender = arg.substring(5).trim();
                } else if (arg.startsWith("since:")) {
                    const dateStr = arg.substring(6).trim();
                    // Validate date format
                    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                        throw new Error(`Invalid date format for 'since'. Use YYYY-MM-DD.`);
                    }
                    countParams.startDate = dateStr;
                } else if (arg.startsWith("until:")) {
                    const dateStr = arg.substring(6).trim();
                    // Validate date format
                    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                        throw new Error(`Invalid date format for 'until'. Use YYYY-MM-DD.`);
                    }
                    countParams.endDate = dateStr;
                }
            }
            
            // Set default date ranges if not specified
            if (!countParams.startDate) {
                const defaultStart = new Date();
                defaultStart.setDate(defaultStart.getDate() - 7); // One week ago
                countParams.startDate = defaultStart.toISOString().split('T')[0];
            }
            
            if (!countParams.endDate) {
                const defaultEnd = new Date();
                countParams.endDate = defaultEnd.toISOString().split('T')[0];
            }

            // Validate that start date is before end date
            const startDate = new Date(countParams.startDate);
            const endDate = new Date(countParams.endDate);
            
            if (startDate > endDate) {
                throw new Error("Start date must be before end date.");
            }
        } catch (parseError) {
            messageBuilder.setText(`❌ Error in count parameters: ${parseError.message}`);
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        messageBuilder.setText("🔢 Counting emails. Please wait...");
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

                try {
                    // Count emails
                    const counts = await emailService.countEmails(countParams);
                    
                    const resultMessageBuilder = modify
                        .getCreator()
                        .startMessage()
                        .setSender(sender)
                        .setRoom(room);

                    if (Object.keys(counts).length === 0) {
                        resultMessageBuilder.setText("No emails found in the specified date range.");
                    } else {
                        let resultText = `📊 **Email Count Results**\n\n`;
                        
                        for (const [date, count] of Object.entries(counts)) {
                            resultText += `**${date}**: ${count} email${count === 1 ? '' : 's'}\n`;
                        }
                        
                        resultMessageBuilder.setText(resultText);
                    }
                    
                    await modify.getCreator().finish(resultMessageBuilder);
                } catch (countError) {
                    const errorMessage = modify
                        .getCreator()
                        .startMessage()
                        .setSender(sender)
                        .setRoom(room);
                    
                    errorMessage.setText(`❌ Error counting emails: ${countError.message}`);
                    await modify.getCreator().finish(errorMessage);
                }
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
            this.app.getLogger().error("Error counting emails:", error);
            
            const errorMessage = modify
                .getCreator()
                .startMessage()
                .setSender(sender)
                .setRoom(room);
            
            errorMessage.setText(`❌ Error counting emails: ${error.message}`);
            await modify.getCreator().finish(errorMessage);
        }
    }
}
