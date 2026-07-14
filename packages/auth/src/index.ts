import type { AuthContext, Authenticator } from "@owbastion/domain";

export type ServiceAuthEnv = {
  QQBOT_API_TOKEN?: string;
};

export const authenticateQqBot: Authenticator<ServiceAuthEnv> = async (request, env): Promise<AuthContext | null> => {
  const token = env.QQBOT_API_TOKEN;
  const authorization = request.headers.get("authorization");

  if (!token || !authorization || authorization !== `Bearer ${token}`) {
    return null;
  }

  return {
    actorType: "service",
    subject: "qqbot",
    roles: ["channel:write"],
    provider: "cloudflare-service-token",
  };
};
