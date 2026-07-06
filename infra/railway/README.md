# Railway Deployment

Deploy both services (web + api) on Railway.

## Setup

1. Create a new Railway project
2. Add two services from the same repo:

### Web Service (Next.js)
- **Root Directory**: `apps/web`
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`
- **Port**: `3000`

### API Service (FastAPI)
- **Root Directory**: `services/api`
- **Build Command**: `pip install -r requirements.txt -r requirements-ml.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

> The Donut extraction stack in `requirements-ml.txt` (torch + transformers) is
> large and downloads ~0.8 GB of model weights on the first parse. Provision a
> service plan with enough memory/disk, or run parsing on-device during development.

## Environment Variables

Set these on the API service:

| Variable | Value |
|----------|-------|
| `B2_APPLICATION_KEY_ID` | Your B2 application key ID |
| `B2_APPLICATION_KEY` | Your B2 application key |
| `B2_BUCKET_NAME` | Your bucket name |
| `B2_REGION` | Your bucket region (e.g., `us-west-004`); the S3 endpoint is derived from it |
| `B2_PUBLIC_URL_BASE` | Optional public base URL for objects (blank if the bucket is private) |
| `API_CORS_ORIGINS` | Your web service URL (e.g., `https://web-production-xxx.up.railway.app`) |

Set this on the Web service:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | Your API service URL (e.g., `https://api-production-xxx.up.railway.app`) |
