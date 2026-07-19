# Build from the REPO ROOT (not backend/), e.g.:
#   docker build -f backend/Dockerfile -t huaweitech4city-backend .
# On Render: Root Directory = repo root, Dockerfile Path = backend/Dockerfile.
# The build context must include the sibling pipeline/ directory -- see
# docs/backend.md's "Deployment" section for why Root Directory can't be
# set to backend/ alone.
FROM python:3.11-slim

WORKDIR /app

COPY pipeline/requirements.txt ./pipeline/requirements.txt
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r pipeline/requirements.txt -r backend/requirements.txt

# Checkpoints are committed to git (a few MB) -- no separate fetch/LFS step
# needed, this COPY brings them into the image directly.
COPY pipeline/ ./pipeline/
COPY backend/ ./backend/

WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
