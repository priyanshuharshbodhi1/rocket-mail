export interface IEmailContact {
    name: string;
    email: string;
}

export interface IContactsStorage {
    contacts: Array<IEmailContact>;
}
