import { Request } from "express";

type UserContext = {
  id: string;
  role?: string;
  organizationId?: string;
  teamIds?: string[];
};

type PostContext = {
  accountId: string;
  content: string;
  mediaUrls: string[];
  mediaType: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";
  user: UserContext;
};

export function extractThreadsPostContext({
  req,
  postData,
}: {
  req?: Request;
  postData?: any;
}): PostContext {
  const accountId =
    postData?.accountId ?? req?.params?.accountId ?? req?.body?.accountId;

  const rawData = postData ?? req?.body?.data ?? {};

  const {
    content,
    mediaUrls = [],
    mediaType = "TEXT",
  } = rawData;

  const user: UserContext = {
    id: postData?.userId ?? (req as any)?.user?.id,
    role: postData?.user?.role ?? (req as any)?.user?.role,
    organizationId: postData?.user?.organizationId ?? (req as any)?.user?.organizationId,
    teamIds: postData?.user?.teamIds ?? (req as any)?.user?.teamIds,
  };

  if (!accountId) {
    throw new Error("Account ID is required");
  }

  if (!user.id) {
    throw new Error("Authenticated user ID is required");
  }

  return {
    accountId,
    content,
    mediaUrls,
    mediaType,
    user,
  };
}