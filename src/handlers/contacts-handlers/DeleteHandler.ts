import { IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { ContactService } from "../../services/ContactService";
import { RocketMailApp } from "../../../RocketMailApp";


export class DeleteCommand {
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
        const [name] = args;
        const appUser = await read.getUserReader().getAppUser() as IUser;
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(appUser)
            .setRoom(room)
            .setGroupable(false);

        if (!name) {
            messageBuilder.setText(
                "Usage: /rocket-mail delete <name>"
            );
            return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());
        }

        try {
            const existingContacts = await this.contactService.getContacts(sender.id, read);

            if (existingContacts.length === 0) {
                messageBuilder.setText("No contacts found to delete.");
                return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());
            }

            const contactIndex = existingContacts.findIndex(contact =>
                contact.name.toLowerCase() === name.toLowerCase()
            );

            if (contactIndex === -1) {
                messageBuilder.setText(`Contact '${name}' not found.`);
                return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());
            }

            existingContacts.splice(contactIndex, 1);

            const success = await this.contactService.saveContacts(sender.id, existingContacts, persistence);

            if (success) {
                messageBuilder.setText(`Contact '${name}' deleted successfully.`);
            } else {
                messageBuilder.setText("Failed to delete contact. Please try again.");
            }
        } catch (error) {
            this.app.getLogger().error("Error deleting contact:", error);
            messageBuilder.setText(`Error deleting contact: ${error.message}`);
        }

        return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());
    }
}
