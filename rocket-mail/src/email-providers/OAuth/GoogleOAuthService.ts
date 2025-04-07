import { IHttp, ILogger, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IUser } from '@rocket.chat/apps-engine/definition/users';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { IOAuthCredentials } from '../../types/interfaces/IOAuthCredentials';

export class GoogleOAuthService {
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
     * IMPORTANT: It must be called before using any other methods
     */
    public async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            this.clientId = await this.settings.get('oauth_client_id');
            this.clientSecret = await this.settings.get('oauth_client_secret');
            this.redirectUri = await this.settings.get('oauth_redirect_uri');

            if (!this.clientId || !this.clientSecret || !this.redirectUri) {
                throw new Error('Missing required OAuth settings. Please configure the OAuth settings in the app configuration.');
            }

            this.initialized = true;
            this.logger.debug('OAuthService initialized successfully', {
                clientIdConfigured: !!this.clientId,
                clientSecretConfigured: !!this.clientSecret,
                redirectUriConfigured: !!this.redirectUri
            });
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
    public async saveState(state: string, userId: string): Promise<void> {
        this.logger.debug(`OAuthService.saveState -> Saving state for user ${userId}`);

        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            `oauth:state:${state}`
        );

        await this.persistence.updateByAssociation(
            association,
            {
                userId,
                timestamp: new Date().getTime()
            },
            true
        );

        this.logger.debug(`OAuthService.saveState -> State saved successfully for user ${userId}`);
    }

    /**
     * Generate OAuth authorization URL for the user
     */
    public async getAuthorizationUrl(userId: string): Promise<string> {
        this.logger.debug(`OAuthService.getAuthorizationUrl -> Generating URL for user ${userId}`);

        // Generate a state parameter for security
        const state = this.generateState();

        // Save the state for this user
        await this.saveState(state, userId);

        // Get the authorization URL with the state parameter
        const url = this.getAuthUrl(state);

        this.logger.debug(`OAuthService.getAuthorizationUrl -> URL generated for user ${userId}`);
        return url;
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
        this.logger.debug('OAuthService.exchangeCodeForTokens -> Exchanging code for tokens');

        try {
            if (!this.initialized) {
                await this.initialize();
            }

            this.logger.debug('OAuthService.exchangeCodeForTokens -> Making token request', {
                clientIdLength: this.clientId.length,
                redirectUri: this.redirectUri
            });

            const response = await this.http.post('https://oauth2.googleapis.com/token', {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                content: `code=${encodeURIComponent(code)}&client_id=${encodeURIComponent(this.clientId)}&client_secret=${encodeURIComponent(this.clientSecret)}&redirect_uri=${encodeURIComponent(this.redirectUri)}&grant_type=authorization_code`,
            });

            if (response.statusCode !== 200) {
                const errorContent = response.content || 'Unknown error';
                this.logger.error(`OAuthService.exchangeCodeForTokens -> Failed with status ${response.statusCode}:`, errorContent);
                throw new Error(`Failed to exchange code for tokens: HTTP ${response.statusCode}`);
            }

            const data = JSON.parse(response.content || '{}');

            if (!data.access_token) {
                this.logger.error('OAuthService.exchangeCodeForTokens -> No access token in response:', data);
                throw new Error('No access token received from OAuth provider');
            }

            // Get user info to get email
            const userInfo = await this.getUserInfo(data.access_token);

            this.logger.debug('OAuthService.exchangeCodeForTokens -> Successfully obtained tokens');

            return {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                token_type: data.token_type,
                expiry_date: Date.now() + (data.expires_in * 1000),
                scope: data.scope,
                email: userInfo.email
            };
        } catch (error) {
            this.logger.error('OAuthService.exchangeCodeForTokens -> Error:', error);
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
            this.logger.error('OAuthService.getUserInfo -> Error:', error);
            throw new Error(`Failed to get user info: ${error.message}`);
        }
    }

    /**
     * Get and validate the state
     */
    public async validateState(state: string): Promise<{userId: string} | undefined> {
        this.logger.debug(`OAuthService.validateState -> Validating state: ${state}`);

        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.MISC,
            `oauth:state:${state}`
        );

        const [result] = await this.read.getPersistenceReader().readByAssociation(association) as Array<{userId: string, timestamp: number}>;

        if (!result) {
            this.logger.error(`OAuthService.validateState -> State not found: ${state}`);
            return undefined;
        }

        // Check if the state is not too old (10 minutes)
        if (Date.now() - result.timestamp > 10 * 60 * 1000) {
            this.logger.error(`OAuthService.validateState -> State expired: ${state}`);
            await this.persistence.removeByAssociation(association);
            return undefined;
        }

        // Clean up the used state
        await this.persistence.removeByAssociation(association);

        this.logger.debug(`OAuthService.validateState -> State validated successfully for user: ${result.userId}`);

        return {
            userId: result.userId
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
            this.logger.error('OAuthService.revokeToken -> Error:', error);

            // Still try to delete credentials even if token revocation failed
            try {
                await this.deleteCredentials(userId);
            } catch (e) {
                this.logger.error('OAuthService.revokeToken -> Failed to delete credentials after revocation error:', e);
            }

            throw new Error(`Failed to revoke token: ${error.message}`);
        }
    }

    /**
     * Refresh access token using refresh token
     */
    public async refreshAccessToken(refreshToken: string): Promise<Partial<IOAuthCredentials>> {
        this.logger.debug('OAuthService.refreshAccessToken -> Refreshing access token');

        try {
            if (!this.initialized) {
                await this.initialize();
            }

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

            this.logger.debug('OAuthService.refreshAccessToken -> Token refreshed successfully');

            return {
                access_token: data.access_token,
                token_type: data.token_type,
                expiry_date: Date.now() + (data.expires_in * 1000),
                scope: data.scope
            };
        } catch (error) {
            this.logger.error('OAuthService.refreshAccessToken -> Error:', error);
            throw new Error(`Failed to refresh access token: ${error.message}`);
        }
    }

    /**
     * Save OAuth credentials for a user
     */
    public async saveCredentials(userId: string, credentials: IOAuthCredentials): Promise<void> {
        this.logger.debug(`OAuthService.saveCredentials -> Saving OAuth credentials for user ${userId}`);

        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${userId}:oauth`
        );

        await this.persistence.updateByAssociation(association, credentials, true);
        this.logger.debug(`OAuthService.saveCredentials -> Credentials saved for user ${userId}`);
    }

    /**
     * Get OAuth credentials for a user
     */
    public async getCredentials(userId: string): Promise<IOAuthCredentials | undefined> {
        this.logger.debug(`OAuthService.getCredentials -> Getting OAuth credentials for user ${userId}`);

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
        this.logger.debug(`OAuthService.deleteCredentials -> Deleting OAuth credentials for user ${userId}`);

        const association = new RocketChatAssociationRecord(
            RocketChatAssociationModel.USER,
            `${userId}:oauth`
        );

        await this.persistence.removeByAssociation(association);
        this.logger.debug(`OAuthService.deleteCredentials -> Credentials deleted for user ${userId}`);
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
            throw new Error('User not authenticated, please use /rocket-mail login to connect your email account');
        }

        // Check if token is expired or about to expire (within 5 minutes)
        if (!credentials.expiry_date || credentials.expiry_date <= Date.now() + 5 * 60 * 1000) {
            this.logger.debug(`OAuthService.getValidAccessToken -> Token expired for user ${userId}, refreshing...`);

            // Token is expired or about to expire, refresh it
            if (!credentials.refresh_token) {
                // If we don't have a refresh token, we can't refresh the access token
                this.logger.error(`OAuthService.getValidAccessToken -> Missing refresh token for user ${userId}`);

                // Delete credentials as they're no longer valid and can't be refreshed
                await this.deleteCredentials(userId);

                throw new Error('Your authentication has expired. Please use /rocket-mail login to reconnect your account');
            }

            try {
                const newTokenData = await this.refreshAccessToken(credentials.refresh_token);

                const updatedCredentials = {
                    ...credentials,
                    ...newTokenData
                };

                await this.saveCredentials(userId, updatedCredentials as IOAuthCredentials);

                this.logger.debug(`OAuthService.getValidAccessToken -> Token refreshed for user ${userId}`);
                return updatedCredentials.access_token!;
            } catch (error) {
                this.logger.error(`OAuthService.getValidAccessToken -> Error refreshing token: ${error.message}`);

                // If token refresh fails, delete the credentials to force re-authentication
                await this.deleteCredentials(userId);

                throw new Error('Your authentication has expired. Please use /rocket-mail login to reconnect your account');
            }
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
