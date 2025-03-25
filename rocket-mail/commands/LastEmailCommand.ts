import {
    IHttp,
    IModify,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { EmailService } from "../services/EmailService";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../RocketMailApp";

export class LastEmailCommand {
    constructor(private readonly app: RocketMailApp) {}

    public async execute(
        sender,
        room,
        read: IRead,
        modify: IModify,
        http: IHttp
    ): Promise<void> {
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        try {
            messageBuilder.setText(
                "Retrieving your last email. Please wait..."
            );
            await modify.getCreator().finish(messageBuilder);

            const settings = await getEmailSettings(
                read.getEnvironmentReader().getSettings()
            );

            const emailService = new EmailService(
                settings,
                this.app.getLogger(),
                http
            );

            const email = await emailService.getLastReceivedEmail();

            const emailMessage = modify
                .getCreator()
                .startMessage()
                .setSender(sender)
                .setRoom(room).setText(`
                **Last Received Email**
                **From:** ${email.from}
                **Subject:** ${email.subject}
                **Date:** ${email.date}

                ${email.content}
                `);

            await modify.getCreator().finish(emailMessage);
        } catch (error) {
            this.app.getLogger().error("Error retrieving email:", error);

            const errorMessage = modify
                .getCreator()
                .startMessage()
                .setSender(sender)
                .setRoom(room)
                .setText(`Error retrieving email: ${error.message}`);

            await modify.getCreator().finish(errorMessage);
        }
    }
}
