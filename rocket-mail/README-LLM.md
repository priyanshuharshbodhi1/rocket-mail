# Rocket Mail LLM Feature

This document explains the implementation of the LLM-powered email features in Rocket Mail, which allow users to interact with their email using natural language commands.

## How It Works

The LLM feature processes natural language commands from users through a pipeline:

1. **User Input**: User enters a command like `/rocket-mail show me emails from boss@example.com from last week`
2. **Command Handler**: Routes non-standard commands to the LLM task handler
3. **Contact Resolution**: Replaces contact names with actual email addresses
4. **LLM Processing**: Sends the task to DeepInfra's Llama 3.3 70B model to parse intent
5. **Action Execution**: Executes the appropriate SMTP/IMAP operation based on LLM interpretation
6. **Response Formatting**: Returns results in a readable format

## Core Components

### Models
- `LLMTask.ts`: Defines interfaces for LLM requests, actions, and results

### Services
- `LLMService.ts`: Handles communication with the DeepInfra API
- `LLMTaskHandler.ts`: Processes tasks and executes email operations
- `EmailService.ts`: Provides SMTP/IMAP functionality through a proxy service
- `ContactService.ts`: Manages and retrieves user contacts

### Features
1. **Email Search**: Find emails matching specific criteria
2. **Email Counting**: Count emails within specific time periods
3. **Email Viewing**: View full content of specific emails
4. **Email Sending**: Send emails to recipients
5. **Contact Integration**: Use saved contacts in commands

## Extending Functionality

### Adding a New Task Type

1. Add the new action type to `LLMEmailActionType` enum in `models/LLMTask.ts`:
```typescript
export enum LLMEmailActionType {
    SEARCH_EMAILS = 'search-emails',
    COUNT_EMAILS = 'count-emails',
    VIEW_EMAIL = 'view-email',
    SEND_EMAIL = 'send-email',
    MY_NEW_TASK = 'my-new-task', // Add your new task here
    UNKNOWN = 'unknown'
}
```

2. Update the system prompt in `LLMService.ts` to include your new action type and parameters.

3. Add a new handler method in `LLMTaskHandler.ts`:
```typescript
private async handleMyNewTask(emailService: EmailService, params: any): Promise<ILLMTaskResult> {
    try {
        // Implement your new feature logic here
        
        return {
            success: true,
            message: "Result of your new task",
            data: { /* Optional result data */ }
        };
    } catch (error) {
        this.logger.error('Error handling new task:', error);
        return {
            success: false,
            message: `Failed to execute new task: ${error.message}`
        };
    }
}
```

4. Update the `executeAction` method in `LLMTaskHandler.ts` to handle your new action type:
```typescript
switch (action.action as LLMEmailActionType) {
    // Existing cases...
    
    case LLMEmailActionType.MY_NEW_TASK:
        return await this.handleMyNewTask(emailService, action.parameters);
        
    case LLMEmailActionType.UNKNOWN:
    default:
        // ...
}
```

### Adding a New Email Service Method

1. Add a new method to `EmailService.ts` to implement the required functionality:
```typescript
public async myNewEmailOperation(params: any): Promise<any> {
    this.logger.debug("EmailService.myNewEmailOperation -> Starting operation with params:", params);

    try {
        const response = await this.http.post('https://youremailproxy.com/imap/newOperation', {
            headers: {
                'Content-Type': 'application/json',
            },
            data: {
                auth: {
                    user: this.settings.email,
                    pass: this.settings.password,
                    host: this.settings.imapServer,
                    port: 993,
                },
                operation: {
                    // Operation-specific parameters
                    param1: params.param1,
                    param2: params.param2
                }
            },
        });

        if (response.statusCode === 200) {
            return response.data.result;
        } else {
            throw new Error(`Operation failed. Status code: ${response.statusCode}`);
        }
    } catch (error) {
        this.logger.error(`EmailService.myNewEmailOperation -> Error: ${error}`);
        throw new Error(`Operation failed: ${error}`);
    }
}
```

2. Call this method from your new task handler in `LLMTaskHandler.ts`.

## Examples

### Search for emails
```
/rocket-mail find emails from boss@example.com with subject "quarterly report" from last month
```

### Count emails
```
/rocket-mail how many emails did I get from marketing team last week?
```

### View specific email
```
/rocket-mail show me email with ID 12345
```

### Send email
```
/rocket-mail send an email to john@example.com with subject "Meeting tomorrow" saying "Can we meet at 2pm to discuss the project?"
```

### Using contacts
```
/rocket-mail send an email to @John asking about the project status
```

## Troubleshooting

If you encounter issues with the LLM feature:

1. Check the app logs for detailed error messages
2. Verify the DeepInfra API key and endpoint are correct
3. Ensure email settings are properly configured
4. Try rephrasing your command to be more specific
5. For complex tasks, break them down into simpler commands
