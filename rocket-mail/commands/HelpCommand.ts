import { IModify } from '@rocket.chat/apps-engine/definition/accessors';

export class HelpCommand {
    public async execute(sender, room, modify: IModify): Promise<void> {
        const helpText = `
            **Rocket.Mail Commands:**

            **Authentication:**
            1. \`/rocket-mail login\` - Login to your email account
            2. \`/rocket-mail logout\` - Disconnect your email account

            **Utilities:**
            1. \`/rocket-mail summarize <text>\` - Summarize text using AI
            2. \`/rocket-mail help\` - Display this help message

            **Email Operations:**
            1. \`/rocket-mail sendemail <recipient> <subject> <message>\` - Send an email
            2. \`/rocket-mail lastemail\` - Display your last received email
            3. \`/rocket-mail search [subject:Subject] [from:Sender] [body:Text] [since:YYYY-MM-DD] [until:YYYY-MM-DD] [limit:Number]\` - Search emails
            4. \`/rocket-mail view <email_id>\` - View a specific email by ID
            5. \`/rocket-mail count [from:Sender] [since:YYYY-MM-DD] [until:YYYY-MM-DD]\` - Count emails by date range
            6. \`/rocket-mail report <number_of_days>\` - Generate comprehensive email report for the specified days

            **Contact Management:**
            1. \`/rocket-mail add <name> <email>\` - Add or update a contact to your email list
            2. \`/rocket-mail delete <name>\` - Delete a contact from your email list
            3. \`/rocket-mail list\` - Show all your saved contacts
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
