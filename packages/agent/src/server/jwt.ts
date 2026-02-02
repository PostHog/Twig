import jwt from "jsonwebtoken";
import { z } from "zod";

export const userDataSchema = z.object({
  run_id: z.string(),
  task_id: z.string(),
  team_id: z.number(),
  user_id: z.number(),
  distinct_id: z.string(),
});

const jwtPayloadSchema = userDataSchema.extend({
  exp: z.number(),
  iat: z.number().optional(),
});

export type JwtPayload = z.infer<typeof userDataSchema>;

export class JwtValidationError extends Error {
  constructor(
    message: string,
    public code: "invalid_token" | "expired" | "invalid_signature",
  ) {
    super(message);
    this.name = "JwtValidationError";
  }
}

export function validateJwt(token: string, secret: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });

    const result = jwtPayloadSchema.safeParse(decoded);
    if (!result.success) {
      throw new JwtValidationError(
        `Missing required fields: ${result.error.message}`,
        "invalid_token",
      );
    }

    return result.data;
  } catch (error) {
    if (error instanceof JwtValidationError) {
      throw error;
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new JwtValidationError("Token expired", "expired");
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new JwtValidationError("Invalid signature", "invalid_signature");
    }
    throw new JwtValidationError("Invalid token", "invalid_token");
  }
}

export function createJwt(
  payload: Omit<JwtPayload, "exp" | "iat">,
  secret: string,
  expiresInSeconds: number = 24 * 60 * 60,
): string {
  return jwt.sign(
    {
      run_id: payload.run_id,
      task_id: payload.task_id,
      team_id: payload.team_id,
      user_id: payload.user_id,
      distinct_id: payload.distinct_id,
    },
    secret,
    {
      algorithm: "HS256",
      expiresIn: expiresInSeconds,
    },
  );
}
