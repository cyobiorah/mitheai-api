import axios from "axios";

export const generateLongLivedToken = async (shortToken: string) => {
  const url = "https://graph.instagram.com/access_token";
  const params = {
    grant_type: "ig_exchange_token",
    client_secret: process.env.INSTAGRAM_CLIENT_SECRET!,
    access_token: shortToken,
  };
  const res = await axios.get(url, { params });
  return res.data;
};

export const getProfile = async (accessToken: string) => {
  const url = `https://graph.instagram.com/me`;
  const res = await axios.get(url, {
    params: {
      fields: "id,username",
      access_token: accessToken,
    },
  });
  return res.data;
};
