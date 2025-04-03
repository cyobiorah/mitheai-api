import { Request, Response } from "express";
import { ContentCollection, User, ContentItem } from "../types";

const db: any = {};

export const createCollection = async (req: Request, res: Response) => {
  try {
    const { name, description, type, rules, teamId } = req.body;
    const user = req.user as User;

    if (!name || !type || !teamId) {
      return res.status(400).json({
        error: "Missing required fields: name, type, teamId",
      });
    }

    // Verify user belongs to team
    if (!user.teamIds?.includes(teamId)) {
      return res.status(403).json({
        error: "You do not have permission to create collections for this team",
      });
    }

    const collection: Omit<ContentCollection, "id"> = {
      name,
      description,
      type,
      rules,
      teamId,
      organizationId: user.organizationId ?? "",
      contentIds: [],
      settings: {
        permissions: [],
        autoAnalyze: false,
        notifications: {
          enabled: false,
          triggers: [],
        },
      },
      createdBy: user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const docRef = await db.collection("collections").add(collection);
    const doc = await docRef.get();

    res.status(201).json({
      ...doc.data(),
      id: doc.id,
    });
  } catch (error: unknown) {
    console.error("Error creating collection:", error);
    res.status(500).json({ error: "Failed to create collection" });
  }
};

export const getCollection = async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    const user = req.user as User;

    const doc = await db.collection("collections").doc(collectionId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const collection = doc.data() as ContentCollection;

    // Verify user has access to this collection
    if (!user.teamIds?.includes(collection.teamId)) {
      return res.status(403).json({
        error: "You do not have permission to view this collection",
      });
    }

    res.json({
      ...collection,
      id: doc.id,
    });
  } catch (error: unknown) {
    console.error("Error getting collection:", error);
    res.status(500).json({ error: "Failed to get collection" });
  }
};

export const updateCollection = async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    const updates = req.body;
    const user = req.user as User;

    const doc = await db.collection("collections").doc(collectionId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const collection = doc.data() as ContentCollection;

    // Verify user has access to this collection
    if (!user.teamIds?.includes(collection.teamId)) {
      return res.status(403).json({
        error: "You do not have permission to update this collection",
      });
    }

    // Don't allow updating certain fields
    delete updates.id;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.organizationId;
    delete updates.teamId;
    delete updates.contentIds; // Content IDs should be managed through dedicated endpoints

    await doc.ref.update({
      ...updates,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await doc.ref.get();

    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id,
    });
  } catch (error: unknown) {
    console.error("Error updating collection:", error);
    res.status(500).json({ error: "Failed to update collection" });
  }
};

export const deleteCollection = async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    const user = req.user as User;

    const doc = await db.collection("collections").doc(collectionId).get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const collection = doc.data() as ContentCollection;

    // Verify user has access to this collection
    if (!user.teamIds?.includes(collection.teamId)) {
      return res.status(403).json({
        error: "You do not have permission to delete this collection",
      });
    }

    await doc.ref.delete();

    res.json({ message: "Collection deleted successfully" });
  } catch (error: unknown) {
    console.error("Error deleting collection:", error);
    res.status(500).json({ error: "Failed to delete collection" });
  }
};

export const addContentToCollection = async (req: Request, res: Response) => {
  try {
    const { collectionId, contentId } = req.params;
    const user = req.user as User;

    // Get both collection and content documents
    const [collectionDoc, contentDoc] = await Promise.all([
      db.collection("collections").doc(collectionId).get(),
      db.collection("content").doc(contentId).get(),
    ]);

    if (!collectionDoc.exists) {
      return res.status(404).json({ error: "Collection not found" });
    }
    if (!contentDoc.exists) {
      return res.status(404).json({ error: "Content not found" });
    }

    const collection = collectionDoc.data() as ContentCollection;
    const content = contentDoc.data() as ContentItem;

    if (!content) {
      return res.status(404).json({ error: "Content not found" });
    }

    // For organization users
    if (user.userType === "organization") {
      // Verify user has access to both collection and content
      if (
        !user.teamIds?.includes(collection.teamId) ||
        (content.teamId && !user.teamIds?.includes(content.teamId))
      ) {
        return res.status(403).json({
          error:
            "You do not have permission to modify this collection or content",
        });
      }
    }
    // For individual users
    else {
      // Verify user owns the content
      if (content.createdBy !== user.uid) {
        return res.status(403).json({
          error: "You do not have permission to modify this content",
        });
      }
    }

    // Check if content is already in collection
    if (collection.contentIds.includes(contentId)) {
      return res.status(400).json({
        error: "Content is already in this collection",
      });
    }

    await collectionDoc.ref.update({
      contentIds: [...collection.contentIds, contentId],
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await collectionDoc.ref.get();

    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id,
    });
  } catch (error: unknown) {
    console.error("Error adding content to collection:", error);
    res.status(500).json({ error: "Failed to add content to collection" });
  }
};

export const removeContentFromCollection = async (
  req: Request,
  res: Response
) => {
  try {
    const { collectionId, contentId } = req.params;
    const user = req.user as User;

    // Get both collection and content documents
    const [collectionDoc, contentDoc] = await Promise.all([
      db.collection("collections").doc(collectionId).get(),
      db.collection("content").doc(contentId).get(),
    ]);

    if (!collectionDoc.exists) {
      return res.status(404).json({ error: "Collection not found" });
    }

    const collection = collectionDoc.data() as ContentCollection;
    const content = contentDoc.exists
      ? (contentDoc.data() as ContentItem)
      : null;

    // For organization users
    if (user.userType === "organization") {
      // Verify user has access to collection and content (if it exists)
      if (
        !user.teamIds?.includes(collection.teamId) ||
        (content?.teamId && !user.teamIds?.includes(content.teamId))
      ) {
        return res.status(403).json({
          error:
            "You do not have permission to modify this collection or content",
        });
      }
    }
    // For individual users
    else {
      // Verify user owns the content (if it exists)
      if (content && content.createdBy !== user.uid) {
        return res.status(403).json({
          error: "You do not have permission to modify this content",
        });
      }
    }

    // Remove content ID from collection
    await collectionDoc.ref.update({
      contentIds: collection.contentIds.filter((id) => id !== contentId),
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await collectionDoc.ref.get();

    res.json({
      ...updatedDoc.data(),
      id: updatedDoc.id,
    });
  } catch (error: unknown) {
    console.error("Error removing content from collection:", error);
    res.status(500).json({ error: "Failed to remove content from collection" });
  }
};

export const listTeamCollections = async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        error: "Authentication required",
      });
    }

    // Handle new users or users in onboarding
    if (user.isNewUser) {
      return res.json([]); // Return empty array for new users
    }

    // Verify user belongs to team
    if (!user.teamIds || !user.teamIds?.includes(teamId)) {
      return res.status(403).json({
        error: "You do not have permission to view collections for this team",
      });
    }

    const snapshot = await db
      .collection("collections")
      .where("teamId", "==", teamId)
      .orderBy("createdAt", "desc")
      .get();

    const collections = snapshot.docs.map((doc: any) => ({
      ...doc.data(),
      id: doc.id,
    }));

    res.json(collections);
  } catch (error: unknown) {
    console.error("Error listing team collections:", error);
    res.status(500).json({
      error: "Failed to list team collections",
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    });
  }
};

// Get personal collections for individual users
export const getPersonalCollections = async (req: Request, res: Response) => {
  try {
    const user = req.user as User;

    // Verify this is an individual user
    if (user.userType !== "individual") {
      return res.status(403).json({
        error: "This endpoint is only for individual users",
      });
    }

    const snapshot = await db
      .collection("collections")
      .where("createdBy", "==", user.uid)
      .where("teamId", "==", null)
      .orderBy("createdAt", "desc")
      .get();

    const collections = snapshot.docs.map((doc: any) => ({
      ...doc.data(),
      id: doc.id,
    }));

    res.json(collections);
  } catch (error: unknown) {
    console.error("Error getting personal collections:", error);
    res.status(500).json({ error: "Failed to get personal collections" });
  }
};
