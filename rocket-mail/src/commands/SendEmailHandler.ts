import {
    IHttp,
    IModify,
    IRead,
    IPersistence,
} from "@rocket.chat/apps-engine/definition/accessors";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../../RocketMailApp";
import { ContactService } from "../services/ContactService";
import { EmailServiceFactory } from "../services/EmailServiceFactory";

export class SendEmailCommand {
    constructor(
        private readonly app: RocketMailApp,
        private readonly contactService: ContactService
    ) {}

    public async execute(
        args: Array<string>,
        sender,
        room,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        const [recipient, subject, ...contentParts] = args;
        const content = contentParts.join(" ");

        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        if (!recipient || !subject || !content) {
            messageBuilder.setText(
                "Usage: /rocket-mail SendEmail <recipient> <subject> <message>"
            );
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        try {
            const settings = await getEmailSettings(
                read.getEnvironmentReader().getSettings()
            );

            // Use the factory to create the appropriate email service
            try {
                const emailService = await EmailServiceFactory.createEmailService(
                    settings,
                    sender.id,
                    this.app.getLogger(),
                    http,
                    read,
                    persistence
                );

                // Send the email
                await emailService.sendEmail({
                    from: settings.email,
                    to: recipient,
                    subject: subject,
                    text: content,
                });

                messageBuilder.setText(
                    `✅ Email sent successfully to ${recipient}`
                );
            } catch (error) {
                // Check if this is an authentication error
                if (error.message && error.message.includes("not authenticated")) {
                    messageBuilder.setText(
                        `🔒 ${error.message}`
                    );
                } else {
                    throw error;
                }
            }
        } catch (error) {
            this.app.getLogger().error("Error sending email:", error);
            messageBuilder.setText(`❌ Error sending email: ${error.message}`);
        }

        await modify.getCreator().finish(messageBuilder);
    }
}
