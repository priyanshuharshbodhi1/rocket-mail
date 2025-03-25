import { IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";
import { RocketChatAssociationModel, RocketChatAssociationRecord } from "@rocket.chat/apps-engine/definition/metadata";
import { IEmailContact, IContactsStorage } from "../models/Contact";
import { RocketMailApp } from "../RocketMailApp";

export class ContactService {
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
            'email-contacts'
        );
    }

    public async getContacts(userId: string, read: IRead): Promise<Array<IEmailContact>> {
        const associations = [
            this.getUserAssociation(userId),
            this.getContactsAssociation()
        ];

        try {
            const reader = read.getPersistenceReader();
            const record = await reader.readByAssociations(associations) as Array<IContactsStorage>;

            if (record && record.length > 0) {
                return record[0].contacts || [];
            }
        } catch (error) {
            this.app.getLogger().error('Error getting contacts:', error);
        }

        return [];
    }

    public async saveContacts(userId: string, contacts: Array<IEmailContact>, persistence: IPersistence): Promise<boolean> {
        const associations = [
            this.getUserAssociation(userId),
            this.getContactsAssociation()
        ];

        try {
            const data: IContactsStorage = { contacts };
            await persistence.updateByAssociations(associations, data, true);
            return true;
        } catch (error) {
            this.app.getLogger().error('Error saving contacts:', error);
            return false;
        }
    }

    public validateEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
}
