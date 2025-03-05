import { Request, Response } from 'express';
import { TwitterService } from '../services/twitter.service';
import { firestore } from "firebase-admin";

export class SocialAccountController {
  private readonly twitterService: TwitterService;
  private readonly db: firestore.Firestore;

  constructor() {
    this.twitterService = new TwitterService();
    this.db = firestore();
  }

  async handleTwitterCallback(req: Request, res: Response) {
    try {
      if (req.query.error) {
        console.error('OAuth error:', req.query);
        return res.redirect(`${process.env.FRONTEND_URL}/settings?error=${req.query.error}`);
      }

      // The Twitter account info is now in req.user from passport
      const { account } = req.user as any;
      
      if (!account) {
        console.error('No account data in callback');
        return res.redirect(`${process.env.FRONTEND_URL}/settings?error=no_account_data`);
      }
      
      // Redirect to the frontend settings page with success
      res.redirect(`${process.env.FRONTEND_URL}/settings?success=true`);
    } catch (error) {
      console.error('Failed to handle Twitter callback:', error);
      res.redirect(`${process.env.FRONTEND_URL}/settings?error=callback_failed`);
    }
  }

  async getSocialAccounts(userId: string) {
    try {
      const accountsSnapshot = await this.db
        .collection("social_accounts")
        .where("userId", "==", userId)
        .get();

      const accounts = accountsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return accounts;
    } catch (error) {
      console.error("Error fetching social accounts:", error);
      throw error;
    }
  }

  async postTweet(req: Request, res: Response) {
    try {
      const { accountId, message } = req.body;

      if (!accountId || !message) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      try {
        const tweet = await this.twitterService.postTweet(accountId, message);
        res.json({ tweet });
      } catch (error) {
        console.error('Failed to post tweet:', error);
        
        if (error instanceof Error) {
          const errorMessage = error.message;
          
          // Handle authentication errors
          if (errorMessage.includes('refresh_token_expired') || 
              errorMessage.includes('reconnect account')) {
            return res.status(401).json({ 
              error: 'Account authentication expired', 
              errorType: 'auth_expired',
              message: 'Your Twitter account needs to be reconnected. Please disconnect and reconnect your account.'
            });
          }
          
          // Handle permission errors
          if (errorMessage.includes('TwitterPermissionError')) {
            return res.status(403).json({ 
              error: 'Permission denied by Twitter', 
              errorType: 'permission_denied',
              message: errorMessage.replace('TwitterPermissionError: ', '')
            });
          }
          
          // Handle rate limiting errors
          if (errorMessage.includes('TwitterRateLimitError') || 
              errorMessage.includes('rate limit')) {
            return res.status(429).json({ 
              error: 'Twitter rate limit exceeded', 
              errorType: 'rate_limit',
              message: 'Twitter rate limit exceeded. Please try again later.'
            });
          }
          
          // Handle API errors
          if (errorMessage.includes('TwitterAPIError')) {
            const statusMatch = errorMessage.match(/(\d{3})/);
            const status = statusMatch ? parseInt(statusMatch[1]) : 500;
            
            return res.status(status).json({ 
              error: 'Twitter API error', 
              errorType: 'api_error',
              message: errorMessage.replace('TwitterAPIError: ', '')
            });
          }
          
          // Handle content validation errors (duplicates, etc.)
          if (errorMessage.includes('duplicate')) {
            return res.status(403).json({ 
              error: 'Tweet content rejected', 
              errorType: 'content_rejected',
              message: 'Tweet was rejected. This could be due to duplicate content or Twitter content policies.'
            });
          }
        }
        
        // Generic error for all other cases
        res.status(500).json({ 
          error: 'Failed to post tweet', 
          message: error instanceof Error ? error.message : 'Unknown error',
          errorType: 'posting_error'
        });
      }
    } catch (error) {
      console.error('Controller error in postTweet:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'An unexpected error occurred in the server'
      });
    }
  }

  async scheduleTweet(req: Request, res: Response) {
    try {
      const { accountId, message, scheduledTime } = req.body;

      if (!accountId || !message || !scheduledTime) {
        return res.status(400).json({ error: 'Missing required parameters' });
      }

      await this.twitterService.scheduleTweet(
        accountId,
        message,
        new Date(scheduledTime)
      );

      res.json({ success: true, message: 'Tweet scheduled successfully' });
    } catch (error) {
      console.error('Failed to schedule tweet:', error);
      res.status(500).json({ error: 'Failed to schedule tweet' });
    }
  }

  async initiateTwitterAuth(req: Request, res: Response) {
    try {
      const authUrl = await this.twitterService.getAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error('Failed to get Twitter auth URL:', error);
      res.status(500).json({ error: 'Failed to initiate Twitter authentication' });
    }
  }

  async disconnectAccount(userId: string, platform: string) {
    try {
      // Find accounts matching the user and platform
      const accountsSnapshot = await this.db
        .collection("social_accounts")
        .where("userId", "==", userId)
        .where("platform", "==", platform)
        .get();

      if (accountsSnapshot.empty) {
        throw new Error("No account found");
      }

      // Delete all matching accounts (should usually be just one)
      const batch = this.db.batch();
      accountsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error(`Error disconnecting ${platform} account:`, error);
      throw error;
    }
  }

  async debugTwitterConnection(req: Request, res: Response) {
    try {
      const { accountId } = req.body;
      
      if (!accountId) {
        // If no specific account ID is provided, get the user's first Twitter account
        const userId = req.user?.uid;
        if (!userId) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        
        const accountsSnapshot = await this.db
          .collection("social_accounts")
          .where("userId", "==", userId)
          .where("platform", "==", "twitter")
          .limit(1)
          .get();
          
        if (accountsSnapshot.empty) {
          return res.status(404).json({ error: 'No Twitter account found for this user' });
        }
        
        const userAccountId = accountsSnapshot.docs[0].id;
        
        // Test the connection
        const results = await this.twitterService.debugTwitterConnection(userAccountId);
        return res.json({
          ...results,
          accountId: userAccountId,
          accountName: accountsSnapshot.docs[0].data().accountName
        });
      }
      
      // If specific account ID is provided, test that account
      const results = await this.twitterService.debugTwitterConnection(accountId);
      res.json(results);
    } catch (error) {
      console.error('Failed to debug Twitter connection:', error);
      res.status(500).json({ 
        error: 'Failed to test Twitter connectivity',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
