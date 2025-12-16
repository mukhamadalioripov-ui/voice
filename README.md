# voice_chat

One VPS, one public IP, TLS (Caddy internal), public web UI, global chat + voice (mediasoup), S3-compatible file uploads (MinIO).

## Requirements
- Docker + Docker Compose

## Quick start
1) Copy env:
   cp .env.example .env
   # edit PUBLIC_IP

2) Start:
   docker compose up -d --build

3) Open:
   https://PUBLIC_IP

## Notes
- TLS is self-signed (Caddy internal), browsers will show a warning until you trust the CA.
- MinIO console: http://PUBLIC_IP:9001
