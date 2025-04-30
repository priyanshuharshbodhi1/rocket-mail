# 🚀 Rocket Mail Features

## 1. Authentication
- [ ] Login and Logout with Gmail (OAuth2.0)
- [ ] (ui)Button-based login 
- [ ] (ui)Button-based confirmation before logout
- [x] remove redundant logout method (which was used before ui button)
- [ ] Automatic token refresh using refresh tokens whenever acces token gets old

## 2. Email Operations
### Send Emails
- [ ] Support email sending and generating its content using the user query. HTML and plain text support.
- [x] (ui)Modal to edit email content before sending it.

### Search Emails
- [ ] Query-based search, Filter by sender/recipient, Date range filtering, Attachment filtering, Result limiting

### Count Emails
- [ ] Filter by sender's email, Date range filtering, Folder/label filtering, Attachment presence filtering
- [x] Keyword-based filtering

### Email Summarization
- [x] Thread summarization(on date range, people involved)
- [x] Channel summarization(on date range, people involved)
- [ ] sending summary to recipient.

### Posting email content
- [x] Support email content and attachments posting in the channel or thread based on user query


## 3. Contact Management
- [ ] Add/Update contacts
- [ ] Delete contacts
- [ ] List all contacts
- [ ] Contact reference in query to LLM(i.e. if user dont gave the email and just name in the query then LLM will have context of it).
- [x] (ui)Doing complete contact management in side modal.

## 4. Report
### Email Activity Reports
- [ ] email report via slash command
- [ ] email report via natural language command
- [x] email report via side modal
- [x] Daily automatic reports, Customizable report time(have not implemented for individual user now), 

## 5. Configuration
- [ ] OAuth Settings
  - [ ] Client ID configuration
  - [ ] Client Secret management
  - [ ] Redirect URI setup
- [ ] Email provider settings
- [ ] Report Settings
  - [ ] Enable/disable automatic reports
  - [ ] Report timing configuration
- [ ] API Configuration
  - [ ] Deep Infra API key management

## 6. Error Handling & Logging
- [ ] Comprehensive error logging
- [ ] User-friendly messages when for absurd user query.

## 7. Add to Calendar
- [ ] add to calendar feature by side modal

