import { IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

export class HelpCommand {
    public async execute(sender: IUser, room: IRoom, modify: IModify, read: IRead): Promise<void> {
        const helpText = `
            **Rocket.Mail Commands:**

            **Natural Language Commands:**
            Just type \`/rocket-mail\` followed by your request in plain language:
            Examples:
            - \`/rocket-mail find emails from John sent last week\`
            - \`/rocket-mail send an email to boss about the project deadline\`
            - \`/rocket-mail summarize this thread and email it to team@example.com\`
            - \`/rocket-mail generate a report for the last 7 days\`

            **Authentication:**
            1. \`/rocket-mail login\` - Login to your email account
            2. \`/rocket-mail logout\` - Disconnect your email account

            **Standard Email Commands:**
            1. \`/rocket-mail help\` - Display this help message
            2. \`/rocket-mail sendemail <recipient> <subject> <message>\` - Send an email
            3. \`/rocket-mail report <no_of_days>\` - Generate comprehensive email report for the last <no_of_days> days

            **Contact Management:**
            1. \`/rocket-mail add <n> <email>\` - Add or update a contact to your email list
            2. \`/rocket-mail delete <n>\` - Delete a contact from your email list
            3. \`/rocket-mail list\` - Show all your saved contacts
            `;

        // Get app user to send notification as the app bot
        const appUser = await read.getUserReader().getAppUser() as IUser;

        // Create message builder for notification
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(appUser)  // Use app bot user instead of sender
            .setRoom(room)
            .setText(helpText)
            .setGroupable(false);

        // Send as notification instead of regular message
        return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());

        // await modify.getCreator().finish(messageBuilder);
    }
}
