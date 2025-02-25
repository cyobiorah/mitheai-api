import { firestore } from "firebase-admin";
import { SocialAccount } from "../models/social-account.model";
import { Client } from 'twitter-api-sdk';

export class TwitterService {
  private readonly db: firestore.Firestore;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    this.clientId = process.env.TWITTER_CLIENT_ID!;
    this.clientSecret = process.env.TWITTER_CLIENT_SECRET!;
    this.db = firestore();
  }

  async createSocialAccount(
    userId: string,
    profile: any,
    accessToken: string,
    refreshToken: string,
    organizationId?: string,
    teamId?: string
  ): Promise<SocialAccount> {
    // Create doc reference first to get the ID
    const docRef = this.db.collection("social_accounts").doc();
    const docId = docRef.id;

    // Create base account object without optional fields
    const baseAccount: SocialAccount = {
      id: docId,
      platform: 'twitter' as const,
      accountType: 'personal' as const,
      accountName: profile.username,
      accountId: profile.id,
      accessToken,
      refreshToken,
      tokenExpiry: firestore.Timestamp.fromMillis(Date.now() + 7200000),
      lastRefreshed: firestore.Timestamp.now(),
      status: 'active' as const,
      userId,
      metadata: {
        profileUrl: `https://twitter.com/${profile.username}`,
        followerCount: profile.public_metrics?.followers_count || 0,
        followingCount: profile.public_metrics?.following_count || 0,
        lastChecked: firestore.Timestamp.now(),
      },
      permissions: {
        canPost: true,
        canSchedule: true,
        canAnalyze: true,
      },
      createdAt: firestore.Timestamp.now(),
      updatedAt: firestore.Timestamp.now(),
    };

    // Add optional fields only if they are defined
    const socialAccount: SocialAccount = {
      ...baseAccount,
      ...(organizationId && { organizationId }),
      ...(teamId && { teamId }),
    };

    // Save to Firestore
    await docRef.set(socialAccount);

    return socialAccount;
  }

  async postTweet(accountId: string, message: string): Promise<any> {
    const account = await this.getSocialAccount(accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const client = new Client(account.accessToken);
    
    const response = await client.tweets.createTweet({
      text: message
    });

    return response;
  }

  async scheduleTweet(
    accountId: string,
    message: string,
    scheduledTime: Date
  ): Promise<void> {
    const accountRef = this.db.collection("social_accounts").doc(accountId);
    const account = await accountRef.get();

    if (!account.exists) {
      throw new Error("Account not found");
    }

    // Store the scheduled tweet in Firestore
    await this.db.collection("scheduled_tweets").add({
      accountId,
      message,
      scheduledTime: firestore.Timestamp.fromDate(scheduledTime),
      status: "pending",
      createdAt: firestore.Timestamp.now(),
      updatedAt: firestore.Timestamp.now(),
    });
  }

  // This method would be called by a cron job or scheduler
  async processScheduledTweets(): Promise<void> {
    const now = firestore.Timestamp.now();

    const scheduledTweets = await this.db
      .collection("scheduled_tweets")
      .where("status", "==", "pending")
      .where("scheduledTime", "<=", now)
      .get();

    for (const tweet of scheduledTweets.docs) {
      const tweetData = tweet.data();
      try {
        await this.postTweet(tweetData.accountId, tweetData.message);
        await tweet.ref.update({
          status: "published",
          updatedAt: now,
        });
      } catch (error: any) {
        await tweet.ref.update({
          status: "failed",
          error: error.message,
          updatedAt: now,
        });
      }
    }
  }

  private async getSocialAccount(accountId: string): Promise<SocialAccount | null> {
    const doc = await this.db.collection("social_accounts").doc(accountId).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data() as SocialAccount;
  }

  async refreshAccessToken(accountId: string): Promise<void> {
    const account = await this.getSocialAccount(accountId);
    if (!account || !account.refreshToken) {
      throw new Error("Account not found or no refresh token");
    }

    const client = new Client(account.accessToken);
    // Refresh token logic will be implemented when needed
  }

  private async generateCodeChallenge(): Promise<{ verifier: string; challenge: string }> {
    const verifier = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return { verifier, challenge };
  }

  async getAuthUrl(): Promise<string> {
    console.log("Twitter OAuth Config:", {
      clientId: this.clientId,
      callbackUrl: process.env.TWITTER_CALLBACK_URL,
    });

    const callbackUrl = process.env.TWITTER_CALLBACK_URL!.replace('www.', '');
    const { verifier, challenge } = await this.generateCodeChallenge();
    
    // Store verifier for later use
    // TODO: Store this securely, perhaps in session or temporary storage
    console.log("Code verifier (save this):", verifier);

    // Make sure URL matches exactly what Twitter expects
    const authUrl =
      "https://twitter.com/i/oauth2/authorize?" +
      `client_id=${encodeURIComponent(this.clientId)}&` +
      `redirect_uri=${encodeURIComponent(callbackUrl)}&` +
      `scope=${encodeURIComponent("tweet.read tweet.write users.read")}&` +
      "response_type=code&" +
      `code_challenge=${challenge}&` +
      "code_challenge_method=S256&" +
      `state=${Math.random().toString(36).substring(7)}`;

    console.log("Generated auth URL:", authUrl);
    console.log("Callback URL being used:", callbackUrl);
    return authUrl;
  }
}
