import {
    IHttp,
    IModify,
    IRead,
    IPersistence,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../RocketMailApp";
import { EmailServiceFactory } from "../services/EmailServiceFactory";

export class ViewEmailCommand {
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

        if (args.length !== 1) {
            messageBuilder.setText(
                "Usage: /rocket-mail view <email_id>"
            );
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        const emailId = args[0];
        
        messageBuilder.setText(`🔍 Retrieving email. Please wait...`);
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

                // Get the email by ID
                const email = await emailService.getEmailById(emailId);
                
                const resultMessageBuilder = modify
                    .getCreator()
                    .startMessage()
                    .setSender(sender)
                    .setRoom(room);

                resultMessageBuilder.setText(
                    `📧 **Email Details**\n\n` +
                    `**From**: ${email.from}\n` +
                    `**To**: ${email.to}\n` +
                    `**Date**: ${email.date}\n` +
                    `**Subject**: ${email.subject}\n\n` +
                    `**Content**:\n${email.content?.substring(0, 2000)}${
                        email.content?.length > 2000 ? "..." : ""
                    }`
                );
                
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
            this.app.getLogger().error(`Error viewing email: ${error}`);
            
            const errorMessage = modify
                .getCreator()
                .startMessage()
                .setSender(sender)
                .setRoom(room);
            
            errorMessage.setText(`❌ Error viewing email: ${error.message}`);
            await modify.getCreator().finish(errorMessage);
        }
    }
}
