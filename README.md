# Mitheia API

Backend service for the Mitheia content management and analysis platform.

## Project Structure

The API is organized using a feature-based architecture:

```
src/
├── auth/                 # Authentication related code
├── content/              # Content management
├── invite/               # Invitation system
├── orgs/                 # Organization management
├── platforms/            # Social media platform integrations
│   ├── twitter/
│   ├── facebook/
│   ├── threads/
│   └── linkedin/
├── socialAccount/        # Social account management
├── socialPost/           # Social post tracking and analytics
├── teams/                # Team management
├── users/                # User management
├── config/               # Configuration files
├── shared/               # Shared utilities and types
└── app.ts                # Main application entry point
```

## Key Features

### Social Account Management
- Secure connection to multiple social media platforms
- Unique account linking with validation to prevent duplicate connections
- Clear ownership model (user/team/organization) with appropriate permissions
- Comprehensive management interface

### Social Post Tracking
- Automatic tracking of all posts made through the platform
- Analytics data collection for post performance metrics
- Support for multiple platforms (Twitter, Facebook, Threads, LinkedIn)
- Robust error handling for token expiration and API issues

## Environment Variables

The API requires the following environment variables to be set. Create a `.env` file in the api directory using the provided `.env.example` as a template.

### Required Environment Variables

#### Server Configuration
- `NODE_ENV`: Application environment (development/production/test)
- `PORT`: Port number for the API server (default: 3001)

#### MongoDB Configuration
- `MONGODB_URI`: MongoDB connection string
- `MONGODB_DB_NAME`: MongoDB database name
- `SESSION_SECRET`: Secret for session management

#### JWT Configuration
- `JWT_SECRET`: Secret key for JWT token generation and validation

#### Email Service (Brevo)
- `BREVO_API_KEY`: API key for Brevo email service
- `BREVO_INVITATION_TEMPLATE_ID`: Template ID for invitation emails
- `WEBAPP_URL`: Base URL of the frontend application

#### Social Media Integration
- `TWITTER_CLIENT_ID`: Twitter API client ID
- `TWITTER_CLIENT_SECRET`: Twitter API client secret
- `FACEBOOK_APP_ID`: Facebook App ID
- `FACEBOOK_APP_SECRET`: Facebook App Secret
- `THREADS_CLIENT_ID`: Threads API client ID
- `THREADS_CLIENT_SECRET`: Threads API client secret
- `LINKEDIN_CLIENT_ID`: LinkedIn API client ID
- `LINKEDIN_CLIENT_SECRET`: LinkedIn API client secret

### Setting Up Environment Variables

1. Copy the `.env.example` file:
   ```bash
   cp .env.example .env
   ```

2. Update the values in `.env` with your actual configuration:
   ```bash
   # Example .env
   NODE_ENV=development
   PORT=3001
   MONGODB_URI=mongodb://localhost:27017
   MONGODB_DB_NAME=mitheai
   # ... add other variables
   ```

### Security Notes

- Never commit `.env` files to version control
- Keep your database credentials and other secrets secure
- Rotate secrets regularly in production

## Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development server:
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3001` (or your configured PORT).
