import { Request, Response as ExpressResponse } from "express";
import { postContent } from "../../services/platforms/facebook.service";
import { getCollections } from "../../config/db";

export const postToFacebook = async ({
  req,
  res,
  postData,
}: {
  req?: Request;
  res?: ExpressResponse;
  postData?: any;
}): Promise<any> => {
  try {
    const { accountId, content, mediaUrls, link } =
      postData ?? req?.body?.data ?? {};
    const userId = postData?.userId ?? (req as any)?.user?.id;

    if (!accountId || !userId) {
      const message = !accountId
        ? "Account ID is required"
        : "Authentication required";
      res?.status(400).json({ status: "error", message });
      return { success: false, error: message };
    }

    if (!content && (!mediaUrls || mediaUrls.length === 0) && !link) {
      const message = "Post content, media, or link is required";
      res?.status(400).json({ status: "error", message });
      return { success: false, error: message };
    }

    const { socialaccounts } = await getCollections();
    const account = await socialaccounts.findOne({
      accountId,
    });

    if (!account || account.platform !== "facebook") {
      const message = "Facebook account not found or invalid";
      res?.status(404).json({ status: "error", message });
      return { success: false, error: message };
    }

    if (account.userId.toString() !== userId) {
      const message = "Unauthorized to post to this account";
      res?.status(403).json({ status: "error", message });
      return { success: false, error: message };
    }

    // Actual post
    const postId = await postContent(
      account.accountId,
      account.accessToken,
      content,
      link,
      mediaUrls
    );

    if (res) {
      return res.status(200).json({
        status: "success",
        message: "Successfully posted to Facebook",
        data: postId,
      });
    }

    return { success: true, postId };
  } catch (error: any) {
    console.error("Error posting to Facebook:", error);
    if (res) {
      res.status(500).json({
        status: "error",
        message: error.message ?? "An unexpected error occurred",
      });
    }
    return { success: false, error: error.message };
  }
};
