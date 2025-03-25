import { IModify } from "@rocket.chat/apps-engine/definition/accessors";

export class HelpCommand {
    public async execute(sender, room, modify: IModify): Promise<void> {
        const helpText = `
            **RocketMail Commands**

            Here are the available commands:

            1. \`/rocket-mail <task>\` - Uses AI to process email-related tasks (e.g., "/rocket-mail How many emails came into my inbox last Saturday").
            2. \`/rocket-mail lastEmail\` - Shows the last received email.
            3. \`/rocket-mail sendEmail <recipient> <subject> <message>\` - Sends an email to the specified recipient.
            4. \`/rocket-mail add <name> <email>\` - Adds/Updates a contact to your email list.
            5. \`/rocket-mail delete <name>\` - Deletes a contact from your email list.
            6. \`/rocket-mail list\` - Shows all your saved contacts/email list.
            7. \`/rocket-mail help\` - Shows the help message.
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
