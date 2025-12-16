import type { Message, User } from "./types";

export async function createSession(nickname: string): Promise<User> {
  const r = await fetch("/api/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nickname })
  });
  if (r.status === 409) throw new Error("NICK_TAKEN");
  if (!r.ok) throw new Error("SESSION_ERROR");
  const data = await r.json();
  return data.user as User;
}

export async function loadMessages(): Promise<Message[]> {
  const r = await fetch("/api/messages?limit=100");
  if (!r.ok) throw new Error("LOAD_ERROR");
  const data = await r.json();
  return data.messages as Message[];
}

export async function uploadFile(file: File): Promise<{
  key: string;
  filename: string;
  mime: string;
  size: number;
}> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error("UPLOAD_ERROR");
  return r.json();
}

export async function getAttachmentUrl(id: string): Promise<string> {
  const r = await fetch(`/api/attachments/${encodeURIComponent(id)}/url`);
  if (!r.ok) throw new Error("ATTACH_URL_ERROR");
  const data = await r.json();
  return data.url as string;
}
