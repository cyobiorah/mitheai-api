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

      const tweet = await this.twitterService.postTweet(accountId, message);
      res.json({ tweet });
    } catch (error) {
      console.error('Failed to post tweet:', error);
      res.status(500).json({ error: 'Failed to post tweet' });
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
}
