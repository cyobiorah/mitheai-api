import { Router } from "express";
import * as controller from "../controllers/collections.controller";
import { requireJwtAuth } from "../middlewares/auth";

const router = Router();

// get organization collections
router.get("/:orgId", requireJwtAuth, controller.listCollectionsOrg);

router.get("/", requireJwtAuth, controller.listIndividualCollections);
router.get("/:id", requireJwtAuth, controller.getCollection);
router.post("/", requireJwtAuth, controller.createCollection);
router.patch("/:id", requireJwtAuth, controller.updateCollection);
router.delete("/:id", requireJwtAuth, controller.deleteCollection);

router.post("/:id/content", requireJwtAuth, controller.addContentToCollection);
router.delete(
  "/:id/content/:cid",
  requireJwtAuth,
  controller.removeContentFromCollection
);

export default router;
