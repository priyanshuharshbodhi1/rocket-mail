export interface IContact {
    /**
     * The name of the contact
     */
    name: string;
    
    /**
     * The email address of the contact
     */
    email: string;
    
    /**
     * Any additional metadata about the contact
     */
    metadata?: Record<string, any>;
}
