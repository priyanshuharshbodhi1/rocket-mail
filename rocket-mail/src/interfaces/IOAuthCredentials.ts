export interface IOAuthCredentials {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    token_type: string;
    scope: string;
    email: string;
}