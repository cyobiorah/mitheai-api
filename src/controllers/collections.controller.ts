import { Request, Response } from "express";
import * as collectionsService from "../services/collections.service";

// List collections for an organization
export async function listCollectionsOrg(req: Request, res: Response) {
  const { orgId } = req.params;
  const collections = await collectionsService.listCollectionsOrg(orgId);
  res.json({
    data: collections,
    message: "Collections retrieved successfully",
    count: collections.length,
  });
}

// List collections
export async function listCollections(req: Request, res: Response) {
  const { ownerId, ownerType } = req.query;
  const collections = await collectionsService.listCollections(
    ownerId as string,
    ownerType as string
  );
  res.json({
    data: collections,
    message: "Collections retrieved successfully",
    count: collections.length,
  });
}

// List individual user collections
export async function listIndividualCollections(req: any, res: Response) {
  const ownerId = req.user.id;
  const collections = await collectionsService.listIndividualCollections(
    ownerId
  );
  res.json({
    data: collections,
    count: collections.length,
    message: "Collections retrieved successfully",
  });
}

// Get collection
export async function getCollection(req: Request, res: Response) {
  console.log({ req });
  const collection = await collectionsService.getCollection(req.params.id);
  if (!collection) return res.status(404).json({ message: "Not found" });
  res.json(collection);
}

// Create collection
export async function createCollection(req: Request, res: Response) {
  const collection = await collectionsService.createCollection(req as any);
  res.status(201).json(collection);
}

// Update collection
export async function updateCollection(req: Request, res: Response) {
  const collection = await collectionsService.updateCollection(
    req.params.id,
    req.body
  );
  res.json(collection);
}

// Delete collection
export async function deleteCollection(req: Request, res: Response) {
  const { id } = req.params;
  await collectionsService.deleteCollection(id);
  res.status(204).end();
}

// Add content to collection
export async function addContentToCollection(req: Request, res: Response) {
  const collection = await collectionsService.addContentToCollection(
    req.params.id,
    req.body.contentId,
    req.body.type
  );
  res.json(collection);
}

// Remove content from collection
export async function removeContentFromCollection(req: Request, res: Response) {
  const collection = await collectionsService.removeContentFromCollection(
    req.params.id,
    req.params.cid,
    req.body.type
  );
  res.json(collection);
}
