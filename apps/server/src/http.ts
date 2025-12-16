import express from "express";
import cors from "cors";
import multer from "multer";
import { nanoid } from "nanoid";
import mime from "mime-types";
import { prisma } from "./prisma.js";
import { env } from "./env.js";
import { putObject } from "./s3.js";

export function buildHttpApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Create (or get) user by nickname; nickname must be unique in DB.
  app.post("/api/session", async (req, res) => {
    const nickname = String(req.body?.nickname ?? "").trim();
    if (!nickname || nickname.length < 2 || nickname.length > 32) {
      return res.status(400).json({ error: "BAD_NICKNAME" });
    }

    const exists = await prisma.user.findUnique({ where: { nickname } });
    if (exists) return res.status(409).json({ error: "NICK_TAKEN" });

    const user = await prisma.user.create({ data: { nickname } });
    return res.json({ user });
  });

  app.get("/api/messages", async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const messages = await prisma.message.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        author: true,
        attachments: true
      }
    });

    res.json({ messages: messages.reverse() });
  });

  // Upload: 10MB max. Store in S3 (MinIO) and return metadata.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "NO_FILE" });

    const filename = req.file.originalname || "file";
    const contentType =
      req.file.mimetype || (mime.lookup(filename) as string) || "application/octet-stream";

    const key = `uploads/${Date.now()}-${nanoid(10)}-${filename}`;
    await putObject({ key, body: req.file.buffer, contentType });

    // For MinIO behind no public 9000, we still return a URL that points to a future /api/file route (we will add later).
    // For MVP we expose MinIO S3 API directly OR keep bucket public. We'll finalize in next package.
    const url = `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${encodeURIComponent(key)}`;

    res.json({
      key,
      url,
      filename,
      mime: contentType,
      size: req.file.size
    });
  });

  return app;
}
