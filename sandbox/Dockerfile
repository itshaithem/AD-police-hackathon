FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy
WORKDIR /app
# The base image ships no Arabic font, so Chromium falls back to a CJK face that cannot shape
# Arabic: every report rendered the Arabic column as disconnected letters. Noto fixes the shaping.
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-core \
    && fc-cache -f && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "playwright==1.47.0" "fastapi==0.115.*" "uvicorn==0.30.*" "httpx==0.27.*"
COPY server.py .
USER pwuser
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9000"]
