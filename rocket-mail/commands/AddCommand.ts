import { IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { ContactService } from "../services/ContactService";
import { RocketMailApp } from "../RocketMailApp";

export class AddCommand {
    constructor(
        private readonly app: RocketMailApp,
        private readonly contactService: ContactService
    ) {}

    public async execute(
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
            messageBuilder.setText(
                "Usage: /rocket-mail add <name> <email>"
            );
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        if (!this.contactService.validateEmail(email)) {
            messageBuilder.setText(
                "Invalid email format. Please provide a valid email address."
            );
            await modify.getCreator().finish(messageBuilder);
            return;
        }

        try {
            const existingContacts = await this.contactService.getContacts(sender.id, read);

            const nameIndex = existingContacts.findIndex(contact =>
                contact.name.toLowerCase() === name.toLowerCase()
            );

            const emailIndex = existingContacts.findIndex(contact =>
                contact.email.toLowerCase() === email.toLowerCase()
            );

            let message = '';

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

            const success = await this.contactService.saveContacts(sender.id, existingContacts, persistence);

            if (success) {
                messageBuilder.setText(message);
            } else {
                messageBuilder.setText("Failed to save contact. Please try again.");
            }
        } catch (error) {
            this.app.getLogger().error("Error adding contact:", error);
            messageBuilder.setText(`Error adding contact: ${error.message}`);
        }

        await modify.getCreator().finish(messageBuilder);
    }
}
