import express from "express";
import cors from "cors";
import multer from "multer";
import { nanoid } from "nanoid";
import mime from "mime-types";
import { prisma } from "./prisma.js";
import { putObject, getPresignedGetUrl } from "./s3.js";

export function buildHttpApp() {
  const app = express();

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // Create user by nickname; must be unique.
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
      include: { author: true, attachments: true }
    });

    res.json({ messages: messages.reverse() });
  });

  // Upload: 10MB max -> store in S3 -> return attachment draft (without direct S3 url)
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

    // The real download URL will be obtained via /api/attachments/:id/url after the message is created.
    res.json({
      key,
      filename,
      mime: contentType,
      size: req.file.size
    });
  });

  // Generate temporary download URL for an attachment
  app.get("/api/attachments/:id/url", async (req, res) => {
    const id = String(req.params.id);

    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) return res.status(404).json({ error: "NOT_FOUND" });

    const url = await getPresignedGetUrl({
      key: attachment.key,
      expiresInSeconds: 60 * 10,
      responseContentDisposition: `attachment; filename="${attachment.filename}"`
    });

    res.json({ url, expiresInSeconds: 600 });
  });

  return app;
}
