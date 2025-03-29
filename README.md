# Rocket Mail

Natural Language Bridge to Legacy Email for Rocket.Chat

## What Rocket Mail Can Do

Rocket Mail is a powerful Rocket.Chat app that integrates your email workflow directly into your Rocket.Chat environment. Using natural language commands, you can seamlessly manage your emails without switching context.

### Key Features

- **Natural Language Email Commands**: Ask for emails, send emails, or generate reports using everyday language
- **Email Summaries**: Summarize email threads and conversations 
- **Smart Contact Management**: Save contacts and refer to them by name in commands
- **Comprehensive Email Reports**: Get detailed stats about your email habits and inbox health
- **Thread Summarization**: Summarize Rocket.Chat threads and optionally email the summary

### Examples

- "Find all emails from John about the project deadline"
- "Send an email to my boss about tomorrow's meeting"
- "Generate a report of my emails from last week" 
- "Summarize this thread and email it to the team"
- "Count how many emails I received on Friday"

## Commands

Rocket Mail offers both natural language commands and structured commands:

### Primary Natural Language Command

```
/rocket-mail <your request in natural language>
```

Simply type `/rocket-mail` followed by your request in plain English. The app understands your intent and performs the appropriate action.

**Examples:**
- `/rocket-mail find emails from John sent last week`
- `/rocket-mail send an email to boss about the project deadline`
- `/rocket-mail summarize this thread and email it to team@example.com`
- `/rocket-mail generate a report for the last 7 days`

### Standard Commands

#### Authentication
1. `/rocket-mail login` - Login to your email account
2. `/rocket-mail logout` - Disconnect your email account

#### Email Operations
1. `/rocket-mail sendemail <recipient> <subject> <message>` - Send an email
2. `/rocket-mail lastemail` - Display your last received email
3. `/rocket-mail search [subject:Subject] [from:Sender] [body:Text] [since:YYYY-MM-DD] [until:YYYY-MM-DD] [limit:Number]` - Search emails
   - Example: `/rocket-mail search subject:"Meeting" from:john@example.com since:2025-03-01`
4. `/rocket-mail view <email_id>` - View a specific email by ID
   - Example: `/rocket-mail view 186abc43def`
5. `/rocket-mail count [from:Sender] [since:YYYY-MM-DD] [until:YYYY-MM-DD]` - Count emails by date range
   - Example: `/rocket-mail count since:2025-03-01 until:2025-03-28`
6. `/rocket-mail report <no_of_days>` - Generate comprehensive email report for the last N days
   - Example: `/rocket-mail report 7`

#### Contact Management
1. `/rocket-mail add <name> <email>` - Add or update a contact to your email list
   - Example: `/rocket-mail add boss jane@company.com`
2. `/rocket-mail delete <name>` - Delete a contact from your email list
   - Example: `/rocket-mail delete boss`
3. `/rocket-mail list` - Show all your saved contacts

#### Utilities
1. `/rocket-mail help` - Display the help message

## Setup for Contributors

### Prerequisites

- Node.js (v14+)
- npm (v6+)
- Rocket.Chat server (local or remote)
- Google Cloud project for Gmail API access

### Local Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/username/rocket-mail.git
   cd rocket-mail
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install the Rocket.Chat Apps CLI:
   ```bash
   npm install -g @rocket.chat/apps-cli
   ```

### Google API Configuration

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/)

2. Enable the Gmail API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it

3. Configure OAuth Consent Screen:
   - Navigate to "APIs & Services" > "OAuth consent screen"
   - Select "External" user type (unless you have a Google Workspace)
   - Fill in required information (app name, user support email, developer contact)
   - Add scopes: `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.compose`
   - Add test users (including your own email)

4. Create OAuth Credentials:
   - Navigate to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Select "Web application"
   - Add authorized redirect URIs:
     - `http://localhost:3000/oauth/callback` (for local testing)
     - `https://your-rocket-chat-server.com/oauth/callback` (for production)
   - Copy the Client ID and Client Secret for the next step

### Set Up Deep Infra API Access

1. Sign up for an account at [Deep Infra](https://deepinfra.com/)
2. Get your API key from the account settings page
3. You'll add this API key to your Rocket.Chat app settings

### Running the App Locally

1. Start the local development server:
   ```bash
   rc-apps deploy --url http://localhost:3000 -u <username> -p <password>
   ```

2. Configure the app settings in Rocket.Chat:
   - OAuth Client ID
   - OAuth Client Secret
   - OAuth Redirect URI
   - Deep Infra API Key

3. For local development with hot reload:
   ```bash
   rc-apps deploy --url http://localhost:3000 -u <username> -p <password> --update
   ```

### Debugging

- Check logs in Rocket.Chat Administration > View Logs
- For more detailed logs, set the app's log level to "Debug" in Rocket.Chat Administration > Apps > Rocket Mail > Settings


## Features in Development

- Support for additional email providers (Outlook, Yahoo, etc.) OR Use SMTP/IMAP protocol for any email provider.
- /rocket-mail <your request in natural language> : API request to llm model in deepinfra needs debugging, Before refactoring the codebase it worked properly.
- Advanced analytics and insights
- Email attachments retrival
- 


---

## License

MIT
