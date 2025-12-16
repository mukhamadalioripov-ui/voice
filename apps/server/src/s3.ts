import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env.js";

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY
  },
  forcePathStyle: true
});

export async function putObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType
    })
  );
}

export async function getPresignedGetUrl(params: {
  key: string;
  expiresInSeconds: number;
  responseContentDisposition?: string;
}) {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: params.key,
    ResponseContentDisposition: params.responseContentDisposition
  });

  // getSignedUrl(client, command, { expiresIn })
  return getSignedUrl(s3, command, { expiresIn: params.expiresInSeconds });
}
