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
        logger.debug('OAuthEndpoint.get -> Received OAuth callback');

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

            if (!code || !state) {
                logger.error('OAuthEndpoint.get -> Missing code or state parameter');
                return this.createResponse(400, 'text/html', this.getErrorHtml('Missing parameters'));
            }

            // Validate the state parameter and get user ID
            const stateInfo = await oauthService.validateState(state);
            if (!stateInfo) {
                logger.error('OAuthEndpoint.get -> Invalid or expired state parameter');
                return this.createResponse(400, 'text/html', this.getErrorHtml('Invalid or expired authorization request'));
            }

            // Exchange code for tokens
            const credentials = await oauthService.exchangeCodeForTokens(code);

            // Save credentials
            await oauthService.saveCredentials(stateInfo.userId, credentials);

            // Send notification to the user
            const appUser = await read.getUserReader().getById('rocket.cat');
            const user = await read.getUserReader().getById(stateInfo.userId);

            if (user && appUser) {
                const room = await read.getRoomReader().getDirectByUsernames([appUser.username, user.username]);

                if (room) {
                    await modify.getNotifier().notifyUser(user, {
                        sender: appUser,
                        room,
                        text: `✅ Your Gmail account (${credentials.email}) has been successfully connected!`,
                    });
                } else {
                    logger.error('OAuthEndpoint.get -> Failed to find direct room for notification');
                }
            } else {
                logger.error('OAuthEndpoint.get -> Failed to find user or app user');
            }

            // Return success page
            return this.createResponse(200, 'text/html', this.getSuccessHtml(credentials.email));
        } catch (error) {
            logger.error('OAuthEndpoint.get -> Error handling OAuth callback:', error);
            return this.createResponse(500, 'text/html', this.getErrorHtml(error.message));
        }
    }

    /**
     * Create an API response
     */
    private createResponse(
        status: number,
        contentType: string,
        body: string
    ): IApiResponse {
        return {
            status,
            headers: {
                'Content-Type': contentType,
            },
            content: body,
        };
    }

    /**
     * Get success HTML page
     */
    private getSuccessHtml(email: string): string {
        return `
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
            color: #2d5bff;
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
            color: #4caf50;
        }
        .email {
            font-weight: bold;
            color: #333;
        }
        .close-button {
            margin-top: 30px;
            background-color: #2d5bff;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        .close-button:hover {
            background-color: #1a46e0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>Authentication Successful</h1>
        <p>Your Gmail account <span class="email">${email}</span> has been successfully connected to Rocket Mail.</p>
        <p>You can now close this window and return to Rocket Chat.</p>
        <button class="close-button" onclick="window.close()">Close Window</button>
    </div>
</body>
</html>
        `;
    }

    /**
     * Get error HTML page
     */
    private getErrorHtml(errorMessage: string): string {
        return `
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
            color: #e53935;
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
            color: #e53935;
        }
        .error-message {
            background-color: #ffebee;
            padding: 10px;
            border-radius: 4px;
            margin: 20px 0;
            color: #c62828;
        }
        .close-button {
            margin-top: 30px;
            background-color: #e53935;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        .close-button:hover {
            background-color: #c62828;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1>Authentication Error</h1>
        <p>There was a problem connecting your Gmail account to Rocket Mail.</p>
        <div class="error-message">${errorMessage}</div>
        <p>Please try again or contact your system administrator if the problem persists.</p>
        <button class="close-button" onclick="window.close()">Close Window</button>
    </div>
</body>
</html>
        `;
    }
}
