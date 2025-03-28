import { IModify } from '@rocket.chat/apps-engine/definition/accessors';

export class HelpCommand {
    public async execute(sender, room, modify: IModify): Promise<void> {
        const helpText = `
            **Rocket.Mail Commands:**

            **Authentication:**
            * \`/rocket-mail login\` - Login to your email account
            * \`/rocket-mail logout\` - Disconnect your email account

            **Email Operations:**
            * \`/rocket-mail sendemail <recipient> <subject> <message>\` - Send an email
            * \`/rocket-mail lastemail\` - Display your last received email
            * \`/rocket-mail search [subject:Subject] [from:Sender] [body:Text] [since:YYYY-MM-DD] [until:YYYY-MM-DD] [limit:Number]\` - Search emails
            * \`/rocket-mail view <email_id>\` - View a specific email by ID
            * \`/rocket-mail count [from:Sender] [since:YYYY-MM-DD] [until:YYYY-MM-DD]\` - Count emails by date range

            **Contact Management:**
            * \`/rocket-mail add <name> <email>\` - Add or update a contact to your email list
            * \`/rocket-mail delete <name>\` - Delete a contact from your email list
            * \`/rocket-mail list\` - Show all your saved contacts

            **Utilities:**
            * \`/rocket-mail summarize <text>\` - Summarize text using AI
            * \`/rocket-mail help\` - Display this help message
            `;

        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room)
            .setText(helpText);

        await modify.getCreator().finish(messageBuilder);
    }
}
