import { IModify, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { IUser } from "@rocket.chat/apps-engine/definition/users";
import { ContactService } from "../../services/ContactService";
import { RocketMailApp } from "../../../RocketMailApp";

export class ListCommand {
    constructor(
        private readonly app: RocketMailApp,
        private readonly contactService: ContactService
    ) {}

    public async execute(
        sender,
        room,
        modify: IModify,
        read: IRead
    ): Promise<void> {
        const appUser = await read.getUserReader().getAppUser() as IUser;
        const messageBuilder = modify
            .getCreator()
            .startMessage()
            .setSender(appUser)
            .setRoom(room)
            .setGroupable(false);

        try {
            const contacts = await this.contactService.getContacts(sender.id, read);

            if (contacts.length === 0) {
                messageBuilder.setText("You have no saved contacts.");
                return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());
            }

            let contactListText = "**Your Email Contacts**\n\n";
            contacts.forEach((contact, index) => {
                contactListText += `${index + 1}. **${contact.name}**: ${contact.email}\n`;
            });

            messageBuilder.setText(contactListText);
        } catch (error) {
            this.app.getLogger().error("Error listing contacts:", error);
            messageBuilder.setText(`Error listing contacts: ${error.message}`);
        }

        return read.getNotifier().notifyUser(sender, messageBuilder.getMessage());
    }
}
