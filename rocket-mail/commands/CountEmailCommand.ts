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
        
        for (const arg of args) {
            if (arg.startsWith("from:")) {
                countParams.sender = arg.substring(5).trim();
            } else if (arg.startsWith("since:")) {
                countParams.startDate = arg.substring(6).trim();
            } else if (arg.startsWith("until:")) {
                countParams.endDate = arg.substring(6).trim();
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

                // Count emails
                const counts = await emailService.countEmails(countParams);
                
                const resultMessageBuilder = modify
                    .getCreator()
                    .startMessage()
                    .setSender(sender)
                    .setRoom(room);

                let resultText = `📊 **Email Count Results**\n\n`;
                
                for (const [date, count] of Object.entries(counts)) {
                    resultText += `**${date}**: ${count} email${count === 1 ? '' : 's'}\n`;
                }
                
                resultMessageBuilder.setText(resultText);
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
