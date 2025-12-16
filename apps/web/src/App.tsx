import React, { useEffect, useMemo, useState } from "react";
import { socket } from "./socket";
import { createSession, getAttachmentUrl, loadMessages, uploadFile } from "./api";
import type { Message, User } from "./types";

type PendingAttachment = {
  key: string;
  filename: string;
  mime: string;
  size: number;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [nickname, setNickname] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(() => {
    return (text.trim().length > 0 || pending.length > 0) && !!user;
  }, [text, pending.length, user]);

  useEffect(() => {
    loadMessages()
      .then(setMessages)
      .catch(() => setError("Не удалось загрузить историю"));
  }, []);

  useEffect(() => {
    function onNewMessage(payload: any) {
      setMessages((prev) => [...prev, payload.message as Message]);
    }
    socket.on("chat:newMessage", onNewMessage);
    return () => {
      socket.off("chat:newMessage", onNewMessage);
    };
  }, []);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const u = await createSession(nickname.trim());
      setUser(u);

      socket.emit("session:attach", { userId: u.id }, (ack: any) => {
        if (!ack?.ok) setError("WS: не удалось прикрепить сессию");
      });
    } catch (err: any) {
      if (String(err?.message) === "NICK_TAKEN") setError("Ник занят");
      else setError("Ошибка входа");
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;

    if (f.size > 10 * 1024 * 1024) {
      setError("Файл больше 10 МБ");
      return;
    }

    try {
      const up = await uploadFile(f);
      setPending((p) => [...p, up]);
      e.target.value = "";
    } catch {
      setError("Ошибка загрузки файла");
    }
  }

  function removePending(idx: number) {
    setPending((p) => p.filter((_, i) => i !== idx));
  }

  function sendMessage() {
    if (!user) return;
    if (!text.trim() && pending.length === 0) return;

    socket.emit(
      "chat:send",
      {
        content: text.trim(),
        attachments: pending
      },
      (ack: any) => {
        if (!ack?.ok) setError(`Ошибка отправки: ${ack?.error ?? "UNKNOWN"}`);
        else {
          setText("");
          setPending([]);
        }
      }
    );
  }

  async function downloadAttachment(a: any) {
    try {
      const url = await getAttachmentUrl(a.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Не удалось получить ссылку на файл");
    }
  }

  return (
    <div className="page">
      <header className="top">
        <div className="title">voice_chat</div>
        <div className="me">{user ? `Вы: ${user.nickname}` : "Не вошли"}</div>
      </header>

      {!user ? (
        <form className="login" onSubmit={onLogin}>
          <input
            placeholder="Уникальный ник"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            minLength={2}
            maxLength={32}
          />
          <button type="submit">Войти</button>
          <div className="hint">
            TLS self-signed: браузер может показать предупреждение.
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      ) : (
        <div className="layout">
          <section className="chat">
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id} className="msg">
                  <div className="meta">
                    <b>{m.author.nickname}</b>{" "}
                    <span className="time">{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  {m.content && <div className="text">{m.content}</div>}
                  {m.attachments?.length > 0 && (
                    <div className="atts">
                      {m.attachments.map((a) => (
                        <button
                          key={a.id}
                          className="att"
                          onClick={() => downloadAttachment(a)}
                          type="button"
                          title={`${a.filename} (${Math.round(a.size / 1024)} KB)`}
                        >
                          Скачать: {a.filename}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="composer">
              <input
                placeholder="Сообщение..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
              />
              <input type="file" onChange={onPickFile} />
              <button disabled={!canSend} onClick={sendMessage}>
                Отправить
              </button>
            </div>

            {pending.length > 0 && (
              <div className="pending">
                {pending.map((p, idx) => (
                  <div key={`${p.key}-${idx}`} className="pendingItem">
                    <span>{p.filename}</span>
                    <button type="button" onClick={() => removePending(idx)}>
                      убрать
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && <div className="error">{error}</div>}
          </section>

          <section className="voice">
            <div className="voiceBox">
              <div className="voiceTitle">Voice (в следующем пакете)</div>
              <div className="voiceHint">
                Для голоса через WebRTC нужен secure context (HTTPS), поэтому TLS уже включён.
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
