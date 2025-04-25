import { ObjectId } from "mongodb";
import { getCollections } from "../config/db";

// export interface CollectionContentRef {
//   _id: ObjectId;
//   type: "socialposts" | "scheduledposts";
// }

export interface Collection {
  _id?: ObjectId;
  name: string;
  description?: string;
  ownerId: ObjectId;
  ownerType: "user" | "org";
  contentRefs: { _id: ObjectId; type: "socialposts" | "scheduledposts" };
  coverImage?: string;
  createdAt: Date;
  updatedAt: Date;
  permissions?: {
    users?: ObjectId[];
    orgs?: ObjectId[];
  };
}

// List collections for an organization
export async function listCollectionsOrg(orgId: string) {
  const { collections } = await getCollections();
  return collections.find({ orgId: new ObjectId(orgId) }).toArray();
}

// List collections for an owner
export async function listCollections(ownerId: string, ownerType: string) {
  const { collections } = await getCollections();
  return collections
    .find({ ownerId: new ObjectId(ownerId), ownerType })
    .toArray();
}

// Get a single collection (with content)
export async function getCollection(id: string) {
  const { collections, socialposts, scheduledposts } = await getCollections();
  const collection = await collections.findOne({ _id: new ObjectId(id) });
  if (!collection) return null;

  const socialIds = (collection.contentRefs ?? [])
    .filter((ref: { type: string; _id: ObjectId }) => ref.type === "socialposts")
    .map((ref: { type: string; _id: ObjectId }) => ref._id);
  const scheduledIds = (collection.contentRefs ?? [])
    .filter((ref: { type: string; _id: ObjectId }) => ref.type === "scheduledposts")
    .map((ref: { type: string; _id: ObjectId }) => ref._id);

  const socialItems = socialIds.length
    ? await socialposts.find({ _id: { $in: socialIds } }).toArray()
    : [];
  const scheduledItems = scheduledIds.length
    ? await scheduledposts.find({ _id: { $in: scheduledIds } }).toArray()
    : [];

  collection.items = [
    ...socialItems.map((i) => ({ ...i, type: "socialposts" })),
    ...scheduledItems.map((i) => ({ ...i, type: "scheduledposts" })),
  ];
  return collection;
}

// Create a new collection
export async function createCollection(req: any) {
  const { body, user } = req;
  const { collections } = await getCollections();
  const now = new Date();
  const doc = {
    ...body,
    ownerId: new ObjectId(user.userId),
    ownerType: user.organizationId ? "org" : "user",
    contentIds: [],
    createdAt: now,
    updatedAt: now,
    ...(user.organizationId
      ? { orgId: new ObjectId(user.organizationId) }
      : {}),
  };
  const result = await collections.insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

// Update collection details
export async function updateCollection(id: string, data: Partial<Collection>) {
  const { collections } = await getCollections();
  await collections.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...data, updatedAt: new Date() } }
  );
  return collections.findOne({ _id: new ObjectId(id) });
}

// Delete collection
export async function deleteCollection(id: string) {
  const { collections } = await getCollections();
  await collections.deleteOne({ _id: new ObjectId(id) });
  return true;
}

// Add content to collection
export async function addContentToCollection(
  id: string,
  contentId: string,
  type: "socialposts" | "scheduledposts"
) {
  const { collections, socialposts, scheduledposts } = await getCollections();
  //   Add to collection
  //   await collections.updateOne(
  //     { _id: new ObjectId(id) },
  //     {
  //       $addToSet: { contentRefs: { _id: new ObjectId(contentId), type } },
  //       $set: { updatedAt: new Date() },
  //     }
  //   );
  //   //   Add collectionId to post
  //   const postCollection = type === "socialposts" ? socialposts : scheduledposts;
  //   await postCollection.updateOne(
  //     { _id: new ObjectId(contentId) },
  //     {
  //       $addToSet: { collectionsId: new ObjectId(id) },
  //       $set: { updatedAt: new Date() },
  //     }
  //   );

  // Update post to reference the collection
  const postCollection = type === "socialposts" ? socialposts : scheduledposts;
  await postCollection.updateOne(
    { _id: new ObjectId(contentId) },
    { $set: { collectionsId: new ObjectId(id), updatedAt: new Date() } }
  );
  // Add post to collection's contentRefs (if not present)
  await collections.updateOne(
    { _id: new ObjectId(id) },
    {
      $addToSet: { contentRefs: { _id: new ObjectId(contentId), type } },
      $set: { updatedAt: new Date() },
    }
  );
  return collections.findOne({ _id: new ObjectId(id) });
}

// Remove content from collection
export async function removeContentFromCollection(
  id: string,
  contentId: string,
  type: "socialposts" | "scheduledposts"
) {
  const { collections, socialposts, scheduledposts } = await getCollections();
  //   Remove from collection
  //   await collections.updateOne(
  //     { _id: new ObjectId(id) },
  //     {
  //       $pull: { contentRefs: { _id: new ObjectId(contentId), type } },
  //       $set: { updatedAt: new Date() },
  //     }
  //   );
  //   Remove collectionId from post
  const postCollection = type === "socialposts" ? socialposts : scheduledposts;
  await postCollection.updateOne(
    { _id: new ObjectId(contentId) },
    // {
    //   $pull: { collectionsId: new ObjectId(id) },
    //   $set: { updatedAt: new Date() },
    // }
    { $unset: { collectionId: "" }, $set: { updatedAt: new Date() } }
  );
  await collections.updateOne(
    { _id: new ObjectId(id) },
    {
      $pull: { contentRefs: { _id: new ObjectId(contentId), type } },
      $set: { updatedAt: new Date() },
    }
  );
  return collections.findOne({ _id: new ObjectId(id) });
}
