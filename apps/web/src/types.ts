export type User = { id: string; nickname: string };

export type Attachment = {
  id: string;
  key: string;
  filename: string;
  mime: string;
  size: number;
};

export type Message = {
  id: string;
  content: string;
  createdAt: string;
  author: User;
  attachments: Attachment[];
};
