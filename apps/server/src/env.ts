import { z } from "zod";
import "dotenv/config";

export const env = z
  .object({
    NODE_ENV: z.string().optional(),
    PORT: z.coerce.number().default(3000),

    PUBLIC_BASE_URL: z.string().url(),

    DATABASE_URL: z.string().min(1),

    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),

    MEDIASOUP_LISTEN_IP: z.string().min(1),
    MEDIASOUP_ANNOUNCED_IP: z.string().min(1)
  })
  .parse(process.env);
