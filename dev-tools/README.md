# Development Tools

This directory contains configuration and tools for local development.

## Included Tools

### 1. Mailhog (Email Testing)

Mailhog catches all outgoing emails and provides a web UI to view them.

- **SMTP Server**: `mailhog:1025` (from Docker) or `localhost:1025` (from host)
- **Web UI**: http://localhost:8025
- **Purpose**: Test email notifications without sending real emails

**Features:**
- View all captured emails in a web interface
- Test email content and formatting
- No emails actually get sent to real addresses

### 2. MockServer (Webhook Testing)

MockServer simulates CRM webhook endpoints for testing integrations.

- **API**: http://localhost:1080
- **Dashboard**: http://localhost:1080/mockserver/dashboard
- **Webhook Endpoint**: http://localhost:1080/webhook/crm

**Pre-configured responses:**
- `POST /webhook/crm` - Returns success with mock lead ID
- All requests are logged and can be viewed in the dashboard

**Configuration files:**
- `webhook-mock/initializerJson.json` - Define mock API responses
- `webhook-mock/mockserver.properties` - MockServer settings

## Usage

All tools start automatically with `docker-compose up`. No additional configuration needed!

### Testing Email Flow

1. Start docker-compose: `docker-compose up`
2. Trigger a submission that sends an email
3. Open http://localhost:8025 to view the email

### Testing Webhook Flow

1. Start docker-compose: `docker-compose up`
2. Submit a lead form
3. Open http://localhost:1080/mockserver/dashboard to see webhook requests
4. Check the request payload and response

## Customizing Mock Responses

Edit `webhook-mock/initializerJson.json` to add or modify mock endpoints.

Example: Add a failing webhook response:

```json
{
  "httpRequest": {
    "method": "POST",
    "path": "/webhook/crm/fail"
  },
  "httpResponse": {
    "statusCode": 500,
    "body": {
      "error": "CRM system unavailable"
    }
  }
}
```

Then restart: `docker-compose restart webhook-mock`

## Production vs Development

**Development (this setup):**
- Emails go to Mailhog (web UI)
- Webhooks go to MockServer
- No real external services contacted

**Production:**
- Emails sent via real SMTP (configured in env vars)
- Webhooks sent to actual CRM endpoints
- Real external service integrations
