import { Response as ExpressResponse } from "express";
import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";
import {
  getCloudinaryTransformations,
  uploadToCloudinaryBuffer,
} from "../utils/cloudinary";
import { postToThreads } from "../controllers/platforms/threads.controller";
import { postToTwitter } from "../controllers/platforms/twitter.controller";
import { postToFacebook } from "../controllers/platforms/facebook.controller";
import { postToInstagram } from "../controllers/platforms/instagram.controller";
import { lookupCollectionDetails } from "../utils/mongoAggregations";
import { postToLinkedIn } from "./platforms/linkedin.service";

// Get social posts by userId
export async function getSocialPostsByUserId(userId: string) {
  const { socialposts } = await getCollections();

  const pipeline = [
    {
      $match: {
        userId: new ObjectId(userId),
      },
    },
    {
      $sort: {
        createdAt: -1, // Newest first
      },
    },
    ...lookupCollectionDetails({
      localField: "collectionsId",
      foreignField: "_id",
      asField: "collection",
      from: "collections",
    }),
  ];

  return socialposts.aggregate(pipeline).toArray();
}

// Get social posts by teamId
export async function getSocialPostsByTeamId(teamId: string, filter: any = {}) {
  const { socialposts } = await getCollections();
  const query = { ...filter, teamId: new ObjectId(teamId) };
  return socialposts.find(query).sort({ createdAt: -1 }).toArray();
}

// Get social posts by organizationId
export async function getSocialPostsByOrganizationId(
  organizationId: string,
  filter: any = {}
) {
  const { socialposts } = await getCollections();
  const query = { ...filter, organizationId: new ObjectId(organizationId) };
  return socialposts.find(query).sort({ createdAt: -1 }).toArray();
}

// General-purpose social post query
export async function getSocialPosts(filter: any = {}) {
  const { socialposts } = await getCollections();
  // Convert any string IDs to ObjectId
  if (filter.userId) filter.userId = new ObjectId(filter.userId);
  if (filter.teamId) filter.teamId = new ObjectId(filter.teamId);
  if (filter.organizationId)
    filter.organizationId = new ObjectId(filter.organizationId);
  return socialposts.find(filter).sort({ createdAt: -1 }).toArray();
}

// Get a single social post by ID
export async function getSocialPostById(postId: string) {
  const { socialposts } = await getCollections();
  return socialposts.findOne({ _id: new ObjectId(postId) });
}

// Create a new social post
export async function createSocialPost(data: any) {
  const { socialposts } = await getCollections();
  const now = new Date();
  const doc = { ...data, createdAt: now, updatedAt: now };
  const result = await socialposts.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

// Update a social post
export async function updateSocialPost(postId: string, data: any) {
  const { socialposts } = await getCollections();
  await socialposts.updateOne(
    { _id: new ObjectId(postId) },
    { $set: { ...data, updatedAt: new Date() } }
  );
  return socialposts.findOne({ _id: new ObjectId(postId) });
}

// Delete a social post
export async function deleteSocialPost(postId: string) {
  const { socialposts } = await getCollections();
  return socialposts.deleteOne({ _id: new ObjectId(postId) });
}

export async function handlePlatformUploadAndPost({
  platform,
  mediaFiles,
  userId,
  postMeta,
  res,
}: {
  platform: string;
  mediaFiles: Express.Multer.File[];
  userId: string;
  postMeta: {
    accountId: string;
    accountName: string;
    accountType: string;
    caption?: string;
    mediaType: "image" | "video";
    platformAccountId: string;
    accessToken: string;
    dimensions: {
      id: string;
      width: number;
      height: number;
    }[];
  };
  res: ExpressResponse;
}): Promise<any> {
  try {
    // Validate file types here if needed

    let uploadUrls: string[] = [];

    if (platform !== "linkedin") {
      uploadUrls = await handleTransformAndUpload({
        mediaFiles,
        postMeta,
        platform,
      });
    }

    const payload = {
      content: postMeta.caption,
      mediaUrls: uploadUrls,
      mediaType: postMeta.mediaType,
      accountId: postMeta.accountId,
      platformAccountId: postMeta.platformAccountId,
      accessToken: postMeta.accessToken,
      userId,
    };

    switch (platform) {
      // Instagram Complete
      case "instagram": {
        await postToInstagram({
          postData: payload,
          res,
        });
        return { success: true };
      }
      case "facebook": {
        await postToFacebook({ postData: payload, res });
        return { success: true };
      }
      case "threads": {
        await postToThreads({ postData: payload, res });
        return { success: true };
      }
      case "twitter": {
        await postToTwitter({ postData: payload, res });
        return { success: true };
      }
      case "linkedin": {
        try {
          const result = await postToLinkedIn({
            postData: payload,
            mediaFiles,
          });
          if (!result.success) {
            return res.status(400).json({ error: result.error });
          }

          return res
            .status(200)
            .json({
              message: "Post published successfully",
              postId: result.postId,
            });
        } catch (err: any) {
          console.error("LinkedIn post error:", err);
          return res
            .status(500)
            .json({ error: "Unexpected error posting to LinkedIn" });
        }
      }
      default:
        return { success: false, error: `Unsupported platform: ${platform}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function handleTransformAndUpload({
  mediaFiles,
  postMeta,
  platform,
}: {
  mediaFiles: Express.Multer.File[];
  postMeta: {
    dimensions: {
      id: string;
      width: number;
      height: number;
    }[];
  };
  platform: string;
}) {
  const uploadedUrls: string[] = [];

  for (const file of mediaFiles) {
    const matchingDimension = postMeta.dimensions.find((dim) =>
      file.originalname.includes(dim.id)
    );

    const transformation = matchingDimension
      ? getCloudinaryTransformations(
          file.mimetype,
          {
            width: matchingDimension.width,
            height: matchingDimension.height,
          },
          platform
        ).transformation
      : undefined;

    let transformations;

    if (transformation) {
      if (file.mimetype.startsWith("image/")) {
        transformations = { image: transformation };
      } else {
        transformations = { video: transformation };
      }
    } else {
      transformations = undefined;
    }

    const uploadResult = await uploadToCloudinaryBuffer(file, {
      folder: "skedlii",
      publicId: `${file.originalname}-${Date.now()}`,
      transformations,
    });

    uploadedUrls.push(uploadResult.secure_url);
  }

  return uploadedUrls;
}
