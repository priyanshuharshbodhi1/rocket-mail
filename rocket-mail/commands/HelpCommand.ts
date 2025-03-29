import { IModify } from '@rocket.chat/apps-engine/definition/accessors';

export class HelpCommand {
    public async execute(sender, room, modify: IModify): Promise<void> {
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

            **Utilities:**
            1. \`/rocket-mail help\` - Display this help message

            **Standard Email Commands:**
            1. \`/rocket-mail sendemail <recipient> <subject> <message>\` - Send an email
            2. \`/rocket-mail lastemail\` - Display your last received email
            3. \`/rocket-mail search [subject:Subject] [from:Sender] [body:Text] [since:YYYY-MM-DD] [until:YYYY-MM-DD] [limit:Number]\` - Search emails
            4. \`/rocket-mail view <email_id>\` - View a specific email by ID
            5. \`/rocket-mail count [from:Sender] [since:YYYY-MM-DD] [until:YYYY-MM-DD]\` - Count emails by date range
            6. \`/rocket-mail report <no_of_days>\` - Generate comprehensive email report for the last <no_of_days> days

            **Contact Management:**
            1. \`/rocket-mail add <n> <email>\` - Add or update a contact to your email list
            2. \`/rocket-mail delete <n>\` - Delete a contact from your email list
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
