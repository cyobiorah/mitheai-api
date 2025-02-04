# Mitheia API

Backend service for the Mitheia content management and analysis platform.

## Environment Variables

The API requires the following environment variables to be set. Create a `.env` file in the api directory using the provided `.env.example` as a template.

### Required Environment Variables

#### Server Configuration
- `NODE_ENV`: Application environment (development/production/test)
- `PORT`: Port number for the API server (default: 3001)

#### Firebase Admin SDK
- `FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_CLIENT_EMAIL`: Service account email from Firebase
- `FIREBASE_PRIVATE_KEY`: Private key from Firebase service account (include quotes)

#### JWT Configuration
- `JWT_SECRET`: Secret key for JWT token generation and validation

#### Email Service (Brevo)
- `BREVO_API_KEY`: API key for Brevo email service
- `BREVO_INVITATION_TEMPLATE_ID`: Template ID for invitation emails
- `WEBAPP_URL`: Base URL of the frontend application

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
   FIREBASE_PROJECT_ID=your-project-id
   # ... add other variables
   ```

### Security Notes

- Never commit `.env` files to version control
- Keep your Firebase private key and other secrets secure
- Rotate secrets regularly in production
- Use different values for development and production

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
