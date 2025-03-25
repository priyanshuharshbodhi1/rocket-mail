import {
    IHttp,
    IModify,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { EmailService } from "../services/EmailService";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../RocketMailApp";
import { ContactService } from "../services/ContactService";

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
        http: IHttp
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

            const emailService = new EmailService(
                settings,
                this.app.getLogger(),
                http
            );

            const success = await emailService.sendEmail({
                from: settings.email,
                to: recipient,
                subject: subject,
                text: content,
            });

            if (success) {
                messageBuilder.setText(
                    `Email sent successfully to ${recipient}`
                );
            } else {
                messageBuilder.setText("Failed to send email");
            }
        } catch (error) {
            this.app.getLogger().error("Error sending email:", error);
            messageBuilder.setText(`Error sending email: ${error.message}`);
        }

        await modify.getCreator().finish(messageBuilder);
    }
}
