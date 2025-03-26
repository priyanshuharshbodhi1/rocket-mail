import { IHttp, ILogger, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export interface IOAuthCredentials {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    token_type: string;
    scope: string;
    email: string;
}

export class OAuthService {
    private clientId: string = '';
    private clientSecret: string = '';
    private redirectUri: string = '';
    private initialized: boolean = false;
    
    constructor(
        private readonly http: IHttp,
        private readonly persistence: IPersistence,
        private readonly read: IRead, 
        private readonly logger: ILogger,
        private readonly settings: any
    ) {}
    
    /**
     * Initialize the service with settings
     * Must be called before using any other methods
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }
        
        try {
            this.clientId = await this.settings.get('oauth_client_id');
            this.clientSecret = await this.settings.get('oauth_client_secret');
            this.redirectUri = await this.settings.get('oauth_redirect_uri');
            this.initialized = true;
            this.logger.debug('OAuthService initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize OAuthService:', error);
            throw new Error('Failed to initialize OAuthService: ' + error.message);
        }
    }

    /**
     * Generate a random state string for OAuth security
     */
    public generateState(): string {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }

    /**
     * Save the OAuth state for a user
     */
    public async saveState(state: string, userId: string, roomId: string): Promise<void> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${userId}:oauth:state`
        );

        await this.persistence.updateByAssociation(
            association, 
            { state, roomId, timestamp: new Date().getTime() },
            true
        );
    }

    /**
     * Generate OAuth authorization URL for the user
     */
    public async getAuthorizationUrl(userId: string): Promise<string> {
        // Generate a state parameter for security
        const state = this.generateState();
        
        // Save the state for this user
        await this.saveState(state, userId, 'direct');
        
        // Get the authorization URL with the state parameter
        return this.getAuthUrl(state);
    }

    /**
     * Generate OAuth authorization URL for Google
     */
    public getAuthUrl(state: string): string {
        const scopes = [
            'https://mail.google.com/',
            'https://www.googleapis.com/auth/gmail.modify',
            'https://www.googleapis.com/auth/gmail.compose',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.readonly',
            'email',
            'profile'
        ];

        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        url.searchParams.append('client_id', this.clientId);
        url.searchParams.append('redirect_uri', this.redirectUri);
        url.searchParams.append('response_type', 'code');
        url.searchParams.append('access_type', 'offline');
        url.searchParams.append('prompt', 'consent');
        url.searchParams.append('scope', scopes.join(' '));
        url.searchParams.append('state', state);

        return url.toString();
    }

    /**
     * Exchange authorization code for tokens
     */
    public async exchangeCodeForTokens(code: string): Promise<IOAuthCredentials> {
        this.logger.debug('Exchanging code for tokens');

        try {
            const response = await this.http.post('https://oauth2.googleapis.com/token', {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                content: `code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(this.clientId)}&client_secret=${encodeURIComponent(this.clientSecret)}&redirect_uri=${encodeURIComponent(this.redirectUri)}&grant_type=authorization_code`,
            });

            if (response.statusCode !== 200) {
                throw new Error(`Failed to exchange code for tokens: ${response.content}`);
            }

            const data = JSON.parse(response.content || '{}');
            
            // Get user info to get email
            const userInfo = await this.getUserInfo(data.access_token);

            return {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                token_type: data.token_type,
                expiry_date: Date.now() + (data.expires_in * 1000),
                scope: data.scope,
                email: userInfo.email
            };
        } catch (error) {
            this.logger.error('Error exchanging code for tokens:', error);
            throw new Error(`Failed to exchange code for tokens: ${error.message}`);
        }
    }

    /**
     * Get user info from Google API
     */
    public async getUserInfo(accessTokenOrUserId: string): Promise<any> {
        try {
            let accessToken = accessTokenOrUserId;
            
            // If a userId was provided, retrieve the access token
            if (accessTokenOrUserId.indexOf('@') === -1 && !accessTokenOrUserId.startsWith('ya29.')) {
                const credentials = await this.getCredentials(accessTokenOrUserId);
                if (!credentials) {
                    throw new Error('User not authenticated');
                }
                
                accessToken = await this.getAccessToken(accessTokenOrUserId);
            }
            
            const response = await this.http.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (response.statusCode !== 200) {
                throw new Error(`Failed to get user info: ${response.content}`);
            }

            return JSON.parse(response.content || '{}');
        } catch (error) {
            this.logger.error('Error getting user info:', error);
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }

    /**
     * Get and validate the state
     */
    public async validateState(state: string): Promise<{userId: string, roomId: string} | undefined> {
        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            `oauth:state:${state}`
        );

        const [result] = await this.read.getPersistenceReader().readByAssociation(association) as Array<{userId: string, roomId: string, timestamp: number}>;
        
        if (!result) {
            return undefined;
        }

        // Check if the state is not too old (10 minutes)
        if (Date.now() - result.timestamp > 10 * 60 * 1000) {
            await this.persistence.removeByAssociation(association);
            return undefined;
        }

        // Clean up the used state
        await this.persistence.removeByAssociation(association);
        
        return {
            userId: result.userId,
            roomId: result.roomId
        };
    }

    /**
     * Revoke the user's token and remove stored credentials
     */
    public async revokeToken(userId: string): Promise<boolean> {
        try {
            const credentials = await this.getCredentials(userId);
            
            if (!credentials) {
                return false;
            }
            
            // Revoke the access token
            await this.http.post('https://oauth2.googleapis.com/revoke', {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                content: `token=${encodeURIComponent(credentials.access_token)}`
            });
            
            // Also revoke the refresh token if it exists
            if (credentials.refresh_token) {
                await this.http.post('https://oauth2.googleapis.com/revoke', {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    content: `token=${encodeURIComponent(credentials.refresh_token)}`
                });
            }
            
            // Remove credentials from storage
            await this.deleteCredentials(userId);
            
            return true;
        } catch (error) {
            this.logger.error('Error revoking token:', error);
            
            // Still try to delete credentials even if token revocation failed
            try {
                await this.deleteCredentials(userId);
            } catch (e) {
                this.logger.error('Failed to delete credentials after token revocation error:', e);
            }
            
            throw new Error(`Failed to revoke token: ${error.message}`);
        }
    }

    /**
     * Refresh access token using refresh token
     */
    public async refreshAccessToken(refreshToken: string): Promise<Partial<IOAuthCredentials>> {
        this.logger.debug('Refreshing access token');

        try {
            const response = await this.http.post('https://oauth2.googleapis.com/token', {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                content: `refresh_token=${encodeURIComponent(refreshToken)}&client_id=${encodeURIComponent(this.clientId)}&client_secret=${encodeURIComponent(this.clientSecret)}&grant_type=refresh_token`,
            });

            if (response.statusCode !== 200) {
                throw new Error(`Failed to refresh token: ${response.content}`);
            }

            const data = JSON.parse(response.content || '{}');
            
            return {
                access_token: data.access_token,
                token_type: data.token_type,
                expiry_date: Date.now() + (data.expires_in * 1000),
                scope: data.scope
            };
        } catch (error) {
            this.logger.error('Error refreshing access token:', error);
            throw new Error(`Failed to refresh access token: ${error.message}`);
        }
    }

    /**
     * Save OAuth credentials for a user
     */
    public async saveCredentials(userId: string, credentials: IOAuthCredentials): Promise<void> {
        this.logger.debug(`Saving OAuth credentials for user ${userId}`);

        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${userId}:oauth`
        );

        await this.persistence.updateByAssociation(association, credentials, true);
    }

    /**
     * Get OAuth credentials for a user
     */
    public async getCredentials(userId: string): Promise<IOAuthCredentials | undefined> {
        this.logger.debug(`Getting OAuth credentials for user ${userId}`);

        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${userId}:oauth`
        );

        const [result] = await this.read.getPersistenceReader().readByAssociation(association) as IOAuthCredentials[];
        return result;
    }

    /**
     * Delete OAuth credentials for a user
     */
    public async deleteCredentials(userId: string): Promise<void> {
        this.logger.debug(`Deleting OAuth credentials for user ${userId}`);

        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${userId}:oauth`
        );

        await this.persistence.removeByAssociation(association);
    }

    /**
     * Check if user is authenticated
     */
    public async isAuthenticated(userId: string): Promise<boolean> {
        const credentials = await this.getCredentials(userId);
        return Boolean(credentials);
    }

    /**
     * Get valid access token, refreshing if necessary
     */
    public async getValidAccessToken(userId: string): Promise<string> {
        const credentials = await this.getCredentials(userId);
        
        if (!credentials) {
            throw new Error('User not authenticated, please authorize with Google first');
        }

        // Check if token is expired or about to expire (within 5 minutes)
        if (!credentials.expiry_date || credentials.expiry_date <= Date.now() + 5 * 60 * 1000) {
            // Token is expired or about to expire, refresh it
            if (!credentials.refresh_token) {
                throw new Error('Missing refresh token, please re-authorize');
            }

            const newTokenData = await this.refreshAccessToken(credentials.refresh_token);
            
            const updatedCredentials = {
                ...credentials,
                ...newTokenData
            };

            await this.saveCredentials(userId, updatedCredentials as IOAuthCredentials);
            
            return updatedCredentials.access_token!;
        }

        // Token is still valid
        return credentials.access_token;
    }

    /**
     * Get access token for a user
     */
    public async getAccessToken(userId: string): Promise<string> {
        const credentials = await this.getCredentials(userId);
        if (!credentials) {
            throw new Error('User not authenticated');
        }
        return credentials.access_token;
    }
}
