import axios from "axios";

export async function uploadImageToLinkedIn({
  fileBuffer,
  mimetype,
  accountUrn,
  accessToken,
}: {
  fileBuffer: Buffer;
  mimetype: string;
  accountUrn: string;
  accessToken: string;
}): Promise<string> {
  try {
    const registerRes = await axios.post(
      "https://api.linkedin.com/rest/images?action=initializeUpload",
      {
        initializeUploadRequest: {
          owner: accountUrn,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "LinkedIn-Version": "202505",
          "Content-Type": "application/json",
        },
      }
    );

    const { uploadUrl, image } = registerRes.data.value;

    const putRes = await axios.put(uploadUrl, fileBuffer, {
      headers: {
        "Content-Type": mimetype,
        "Content-Length": fileBuffer.length,
      },
      timeout: 10000, // add timeout
    });

    return image;
  } catch (err: any) {
    console.error(
      "LinkedIn image upload failed:",
      err.response?.data ?? err.message
    );
    throw new Error("LinkedIn image upload failed");
  }
}

export async function uploadVideoToLinkedIn({
  fileBuffer,
  mimetype,
  accountUrn,
  accessToken,
}: {
  fileBuffer: Buffer;
  mimetype: string; // should be "video/mp4"
  accountUrn: string;
  accessToken: string;
}): Promise<string> {
  const registerRes = await axios.post(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
        owner: accountUrn,
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent",
          },
        ],
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  const uploadInfo = registerRes.data.value;
  const uploadUrl =
    uploadInfo.uploadMechanism[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ].uploadUrl;
  const assetUrn = uploadInfo.asset;

  await axios.put(uploadUrl, fileBuffer, {
    headers: {
      "Content-Type": mimetype,
      "Content-Length": fileBuffer.length,
    },
  });

  return assetUrn;
}
