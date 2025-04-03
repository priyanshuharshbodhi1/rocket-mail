import {
    IHttp,
    IModify,
    IRead,
    IPersistence
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../../RocketMailApp";
import { EmailServiceFactory } from "../services/EmailServiceFactory";

export class LastEmailCommand {
    constructor(private readonly app: RocketMailApp) {}

    public async execute(
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

        messageBuilder.setText("Retrieving your last email. Please wait...");
        await modify.getCreator().finish(messageBuilder);

        try {
            const settings = await getEmailSettings(
                read.getEnvironmentReader().getSettings()
            );

            try {
                // Use the factory to create the appropriate email service
                const emailService = await EmailServiceFactory.createEmailService(
                    settings,
                    sender.id,
                    this.app.getLogger(),
                    http,
                    read,
                    persistence
                );

                // Get the last email
                const lastEmail = await emailService.getLastReceivedEmail();

                const resultMessageBuilder = modify
                    .getCreator()
                    .startMessage()
                    .setSender(sender)
                    .setRoom(room);

                resultMessageBuilder.setText(
                    `📧 **Last Email In Inbox:**\n\n` +
                    `**From**: ${lastEmail.from}\n` +
                    `**Date**: ${lastEmail.date}\n` +
                    `**Subject**: ${lastEmail.subject}\n\n` +
                    `**Content**:\n${lastEmail.content?.substring(0, 1000)}${
                        lastEmail.content?.length > 1000 ? "..." : ""
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
            this.app.getLogger().error("Error retrieving email:", error);

            const errorMessage = modify
                .getCreator()
                .startMessage()
                .setSender(sender)
                .setRoom(room);

            errorMessage.setText(`❌ Error retrieving email: ${error.message}`);
            await modify.getCreator().finish(errorMessage);
        }
    }
}
