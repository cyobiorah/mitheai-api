import { Request, Response } from "express";
import crypto from "crypto";

export const getSignedCloudinaryParams = async (
  req: Request,
  res: Response
) => {
  const { folder, public_id } = req.body;

  if (!folder || !public_id) {
    return res.status(400).json({ error: "Missing folder or public_id" });
  }

  const timestamp = Math.floor(Date.now() / 1000);

  const signature = crypto
    .createHash("sha1")
    .update(
      `folder=${folder}&public_id=${public_id}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`
    )
    .digest("hex");

  res.json({
    signature,
    timestamp,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
  });
};
