// import { ContentItem, User, SocialPlatform } from "../types";
// import { ContentStateService } from "./content-state.service";
// import { TwitterService } from "./twitter.service";
// // import { getFirestore, Timestamp } from "firebase-admin/firestore";
// import { v4 as uuidv4 } from "uuid";

// interface CreateContentOptions {
//   platform: SocialPlatform;
//   content: string;
//   mediaUrls?: string[];
//   scheduledTime?: Date;
// }

// // interface ContentMetadata {
// //   source: string;
// //   language: string;
// //   tags: string[];
// //   customFields: Record<string, any>;
// //   socialPost?: {
// //     platform: SocialPlatform;
// //     scheduledTime?: Date;
// //     publishedTime?: Date;
// //     postId?: string;
// //     retryCount?: number;
// //     failureReason?: string;
// //   };
// // }

// export class ContentService {
//   private db = getFirestore();
//   private contentCollection = this.db.collection("contents");

//   constructor(
//     private twitterService: TwitterService,
//     private contentStateService: ContentStateService
//   ) {}

//   async createContent(
//     user: User,
//     options: CreateContentOptions
//   ): Promise<ContentItem> {
//     const now = Timestamp.now();

//     // Create initial content in draft state
//     const content: ContentItem = {
//       id: uuidv4(),
//       type: "social_post",
//       content: options.content,
//       status: "draft",
//       metadata: {
//         source: "user",
//         language: "en", // Default, could be made configurable
//         tags: [],
//         customFields: {},
//         socialPost: {
//           platform: options.platform,
//           scheduledTime: options.scheduledTime ?? undefined,
//         },
//       },
//       teamId: user.teamIds?.[0] ?? null,
//       organizationId: user.organizationId ?? null,
//       createdBy: user.uid,
//       createdAt: now.toDate(),
//       updatedAt: now.toDate(),
//     };

//     // Validate content
//     await this.validateContent(content);

//     // Save to database
//     return await this.saveContent(content);
//   }

//   async getContent(contentId: string): Promise<ContentItem> {
//     const doc = await this.contentCollection.doc(contentId).get();
//     if (!doc.exists) {
//       throw new Error(`Content with ID ${contentId} not found`);
//     }
//     return doc.data() as ContentItem;
//   }

//   private async saveContent(content: ContentItem): Promise<ContentItem> {
//     await this.contentCollection.doc(content.id).set(content, { merge: true });
//     return content;
//   }

//   async publishContent(user: User, contentId: string): Promise<ContentItem> {
//     const content = await this.getContent(contentId);

//     // Validate content has social post metadata
//     if (!content.metadata?.socialPost) {
//       throw new Error("Content is not configured for social media posting");
//     }

//     // Validate state transition
//     const transitionResult = await ContentStateService.validateStateTransition(
//       content.status,
//       "pending",
//       user,
//       content
//     );

//     if (!transitionResult.success) {
//       throw new Error(transitionResult.error);
//     }

//     // Platform-specific posting
//     try {
//       if (content.metadata.socialPost.platform === "twitter") {
//         const postResult = await this.twitterService.post(content);
//         content.metadata.socialPost.postId = postResult.id;
//         content.status = "posted";
//       }
//       // Add other platforms here
//     } catch (error: any) {
//       content.status = "failed";
//       content.metadata.socialPost.failureReason = error.message;
//     }

//     return await this.saveContent(content);
//   }

//   private async validateContent(content: ContentItem): Promise<void> {
//     // Platform-specific validation
//     switch (content.metadata.socialPost?.platform) {
//       case "twitter":
//         if (content.content.length > 280) {
//           throw new Error("Twitter content exceeds 280 characters");
//         }
//         break;
//       // Add other platform validations
//     }
//   }
// }
