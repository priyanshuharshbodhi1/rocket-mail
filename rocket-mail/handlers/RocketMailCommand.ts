import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import {
    ISlashCommand,
    SlashCommandContext,
} from "@rocket.chat/apps-engine/definition/slashcommands";
import { EmailService } from "../services/EmailService";
import { getEmailSettings } from "../config/SettingsManager";
import { RocketMailApp } from "../RocketMailApp";
import {
    RocketChatAssociationModel,
    RocketChatAssociationRecord,
} from "@rocket.chat/apps-engine/definition/metadata";

interface IEmailContact {
    name: string;
    email: string;
}

interface IContactsStorage {
    contacts: Array<IEmailContact>;
}

class ContactManager {
    constructor(private readonly app: RocketMailApp) {}

    private getUserAssociation(userId: string): RocketChatAssociationRecord {
        return new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${userId}-contacts`
        );
    }

    private getContactsAssociation(): RocketChatAssociationRecord {
        return new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            "email-contacts"
        );
    }

    public async getContacts(
        userId: string,
        read: IRead
    ): Promise<Array<IEmailContact>> {
        const associations = [
            this.getUserAssociation(userId),
            this.getContactsAssociation(),
        ];

        try {
            const reader = read.getPersistenceReader();
            const record = (await reader.readByAssociations(
                associations
            )) as Array<IContactsStorage>;

            if (record && record.length > 0) {
                return record[0].contacts || [];
            }
        } catch (error) {
            this.app.getLogger().error("Error getting contacts:", error);
        }

        return [];
    }

    public async saveContacts(
        userId: string,
        contacts: Array<IEmailContact>,
        persistence: IPersistence
    ): Promise<boolean> {
        const associations = [
            this.getUserAssociation(userId),
            this.getContactsAssociation(),
        ];

        try {
            const data: IContactsStorage = { contacts };
            await persistence.updateByAssociations(associations, data, true);
            return true;
        } catch (error) {
            this.app.getLogger().error("Error saving contacts:", error);
            return false;
        }
    }
}

export class RocketMailCommand implements ISlashCommand {
    public command = "rocket-mail";
    public i18nDescription = "Handles email commands";
    public i18nParamsExample = "<subcommand>";
    public providesPreview = false;
    private contactManager: ContactManager;

    constructor(private readonly app: RocketMailApp) {
        this.contactManager = new ContactManager(app);
    }

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<void> {
        const [subcommand, ...args] = context.getArguments();
        const sender = context.getSender();
        const room = context.getRoom();

        if (!subcommand) {
            await this.sendHelpMessage(sender, room, modify);
            return;
        }

        switch (subcommand.toLowerCase()) {
            case "sendemail":
                await this.handleSendEmail(
                    args,
                    sender,
                    room,
                    read,
                    modify,
                    http
                );
                break;
            case "lastemail":
                await this.handleLastEmail(sender, room, read, modify, http);
                break;
            case "add":
                await this.handleAddContact(
                    args,
                    sender,
                    room,
                    modify,
                    persistence,
                    read
                );
                break;
            case "delete":
                await this.handleDeleteContact(
                    args,
                    sender,
                    room,
                    modify,
                    persistence,
                    read
                );
                break;
            case "list":
                await this.handleListContacts(sender, room, modify, read);
                break;
            case "help":
                await this.sendHelpMessage(sender, room, modify);
                break;
            default:
                await this.handleLLMTask(
                    subcommand,
                    args,
                    sender,
                    room,
                    modify
                );
                break;
        }
    }

    private async handleLastEmail(
        sender,
        room,
        read,
        modify,
        http
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

    private async handleSendEmail(
        args,
        sender,
        room,
        read,
        modify,
        http
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

    private async handleAddContact(
        args: Array<string>,
        sender,
        room,
        modify: IModify,
        persistence: IPersistence,
        read: IRead
    ): Promise<void> {
        const [name, email] = args;
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        if (!name || !email) {
            messageBuilder.setText("Usage: /rocket-mail add <name> <email>");
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            messageBuilder.setText(
                "Invalid email format. Please provide a valid email address."
            );
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        try {
            const existingContacts = await this.contactManager.getContacts(
                sender.id,
                read
            );

            const nameIndex = existingContacts.findIndex(
                (contact) => contact.name.toLowerCase() === name.toLowerCase()
            );

            const emailIndex = existingContacts.findIndex(
                (contact) => contact.email.toLowerCase() === email.toLowerCase()
            );

            let message = "";

            if (nameIndex !== -1) {
                existingContacts[nameIndex].email = email;
                message = `Updated contact: Name: ${name} with new email: ${email}`;
            } else if (emailIndex !== -1) {
                existingContacts[emailIndex].name = name;
                message = `Updated contact: Email: ${email} with new name: ${name}`;
            } else {
                existingContacts.push({ name, email });
                message = `Contact added successfully!\nName: ${name}\nEmail: ${email}`;
            }

            const success = await this.contactManager.saveContacts(
                sender.id,
                existingContacts,
                persistence
            );

            if (success) {
                messageBuilder.setText(message);
            } else {
                messageBuilder.setText(
                    "Failed to save contact. Please try again."
                );
            }
        } catch (error) {
            this.app.getLogger().error("Error adding contact:", error);
            messageBuilder.setText(`Error adding contact: ${error.message}`);
        }

        await modify.getCreator().finish(messageBuilder);
    }

    private async handleDeleteContact(
        args: Array<string>,
        sender,
        room,
        modify: IModify,
        persistence: IPersistence,
        read: IRead
    ): Promise<void> {
        const [name] = args;
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        if (!name) {
            messageBuilder.setText("Usage: /rocket-mail delete <name>");
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        try {
            const existingContacts = await this.contactManager.getContacts(
                sender.id,
                read
            );

            if (existingContacts.length === 0) {
                messageBuilder.setText("No contacts found to delete.");
                await modify.getCreator().finish(messageBuilder);
                return;
            }

            const contactIndex = existingContacts.findIndex(
                (contact) => contact.name.toLowerCase() === name.toLowerCase()
            );

            if (contactIndex === -1) {
                messageBuilder.setText(`Contact '${name}' not found.`);
                await modify.getCreator().finish(messageBuilder);
                return;
            }

            existingContacts.splice(contactIndex, 1);

            const success = await this.contactManager.saveContacts(
                sender.id,
                existingContacts,
                persistence
            );

            if (success) {
                messageBuilder.setText(
                    `Contact '${name}' deleted successfully.`
                );
            } else {
                messageBuilder.setText(
                    "Failed to delete contact. Please try again."
                );
            }
        } catch (error) {
            this.app.getLogger().error("Error deleting contact:", error);
            messageBuilder.setText(`Error deleting contact: ${error.message}`);
        }

        await modify.getCreator().finish(messageBuilder);
    }

    private async handleListContacts(
        sender,
        room,
        modify: IModify,
        read: IRead
    ): Promise<void> {
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room);

        try {
            const contacts = await this.contactManager.getContacts(
                sender.id,
                read
            );

            if (contacts.length === 0) {
                messageBuilder.setText("You have no saved contacts.");
                await modify.getCreator().finish(messageBuilder);
                return;
            }

            let contactListText = "**Your Email Contacts**\n\n";
            contacts.forEach((contact, index) => {
                contactListText += `${index + 1}. **${contact.name}**: ${
                    contact.email
                }\n`;
            });

            messageBuilder.setText(contactListText);
        } catch (error) {
            this.app.getLogger().error("Error listing contacts:", error);
            messageBuilder.setText(`Error listing contacts: ${error.message}`);
        }

        await modify.getCreator().finish(messageBuilder);
    }

    private async handleLLMTask(
        task: string,
        args: Array<string>,
        sender,
        room,
        modify
    ): Promise<void> {
        const fullTask = [task, ...args].join(" ");

        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(sender)
            .setRoom(room)
            .setText(
                `Processing task: "${fullTask}"\n\nThis functionality will be implemented to use an LLM to process email-related tasks.`
            );

        await modify.getCreator().finish(messageBuilder);
    }

    private async sendHelpMessage(sender, room, modify): Promise<void> {
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
