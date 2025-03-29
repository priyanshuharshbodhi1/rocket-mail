import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import {
    IApiEndpoint,
    IApiEndpointInfo,
    IApiRequest,
    IApiResponse,
} from '@rocket.chat/apps-engine/definition/api';
import { RocketMailApp } from '../RocketMailApp';
import { OAuthService } from '../services/OAuthService';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

export class OAuthEndpoint implements IApiEndpoint {
    public path = 'oauth-callback';

    constructor(private readonly app: RocketMailApp) {}

    public async get(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persistence: IPersistence
    ): Promise<IApiResponse> {
        const logger = this.app.getLogger();
        logger.debug('OAuthEndpoint.get -> Received OAuth callback', request.query);

        try {
            // Initialize OAuth service
            const settings = {
                get: async (key: string) => {
                    switch(key) {
                        case 'oauth_client_id':
                            return await this.app.getOAuthClientId();
                        case 'oauth_client_secret':
                            return await this.app.getOAuthClientSecret();
                        case 'oauth_redirect_uri':
                            return await this.app.getOAuthRedirectUri();
                        default:
                            return '';
                    }
                }
            };

            const oauthService = new OAuthService(http, persistence, read, logger, settings);
            await oauthService.initialize();

            // Get code and state from query
            const code = request.query.code;
            const state = request.query.state;

            logger.debug('OAuthEndpoint.get -> Code and state received', { code: !!code, state });

            if (!code || !state) {
                logger.error('OAuthEndpoint.get -> Missing code or state parameter');
                return this.createErrorResponse('Missing required parameters (code or state)');
            }

            // Validate the state parameter and get user ID
            const stateInfo = await oauthService.validateState(state);
            if (!stateInfo) {
                logger.error('OAuthEndpoint.get -> Invalid or expired state parameter');
                return this.createErrorResponse('Invalid or expired authorization request');
            }

            logger.debug('OAuthEndpoint.get -> State validated, user ID:', stateInfo.userId);

            // Exchange code for tokens
            try {
                const credentials = await oauthService.exchangeCodeForTokens(code);

                // Save credentials
                await oauthService.saveCredentials(stateInfo.userId, credentials);
                logger.info(`OAuthEndpoint.get -> Credentials saved for user ${stateInfo.userId}`);

                // Return success page - the user will see a confirmation in their browser
                return this.createSuccessResponse(credentials.email);
            } catch (error) {
                logger.error('OAuthEndpoint.get -> Error exchanging code for tokens:', error);
                return this.createErrorResponse(`Error obtaining access token: ${error.message}`);
            }
        } catch (error) {
            logger.error('OAuthEndpoint.get -> Error handling OAuth callback:', error);
            return this.createErrorResponse(`An error occurred: ${error.message}`);
        }
    }

    /**
     * Create an error response
     */
    private createErrorResponse(errorMessage: string): IApiResponse {
        return {
            status: 400,
            headers: {
                'Content-Type': 'text/html',
            },
            content: `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Rocket Mail - Authentication Error</title>
                    <style>
                        body {
                            font-family: 'Arial', sans-serif;
                            background-color: #f5f5f5;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                        }
                        .container {
                            background-color: white;
                            border-radius: 8px;
                            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                            padding: 40px;
                            max-width: 500px;
                            text-align: center;
                        }
                        h1 {
                            color: #e74c3c;
                            margin-bottom: 20px;
                        }
                        p {
                            color: #444;
                            font-size: 16px;
                            line-height: 1.6;
                        }
                        .error-icon {
                            font-size: 72px;
                            margin-bottom: 20px;
                            color: #e74c3c;
                        }
                        .close-button {
                            margin-top: 30px;
                            background-color: #e74c3c;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 16px;
                        }
                        .close-button:hover {
                            background-color: #c0392b;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="error-icon">❌</div>
                        <h1>Authentication Error</h1>
                        <p>${errorMessage}</p>
                        <p>Please try again or contact your administrator.</p>
                        <button class="close-button" onclick="window.close()">Close Window</button>
                    </div>
                </body>
                </html>
                            `,
        };
    }

    /**
     * Create a success response
     */
    private createSuccessResponse(email: string): IApiResponse {
        return {
            status: 200,
            headers: {
                'Content-Type': 'text/html',
            },
            content: `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Rocket Mail - Authentication Success</title>
                    <style>
                        body {
                            font-family: 'Arial', sans-serif;
                            background-color: #f5f5f5;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            margin: 0;
                        }
                        .container {
                            background-color: white;
                            border-radius: 8px;
                            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                            padding: 40px;
                            max-width: 500px;
                            text-align: center;
                        }
                        h1 {
                            color: #2ecc71;
                            margin-bottom: 20px;
                        }
                        p {
                            color: #444;
                            font-size: 16px;
                            line-height: 1.6;
                        }
                        .success-icon {
                            font-size: 72px;
                            margin-bottom: 20px;
                            color: #2ecc71;
                        }
                        .email {
                            font-weight: bold;
                            color: #333;
                        }
                        .close-button {
                            margin-top: 30px;
                            background-color: #2ecc71;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 16px;
                        }
                        .close-button:hover {
                            background-color: #27ae60;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="success-icon">✅</div>
                        <h1>Authentication Successful</h1>
                        <p>Your Gmail account <span class="email">${email}</span> has been successfully connected to Rocket Mail.</p>
                        <p>You can now close this window and return to Rocket Chat to use email commands.</p>
                        <button class="close-button" onclick="window.close()">Close Window</button>
                    </div>
                    <script>
                        // Auto-close after 5 seconds
                        setTimeout(() => {
                            window.close();
                        }, 5000);
                    </script>
                </body>
                </html>
                            `,
        };
    }
}
