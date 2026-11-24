FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy
WORKDIR /app
RUN pip install --no-cache-dir "playwright==1.47.0" "fastapi==0.115.*" "uvicorn==0.30.*" "httpx==0.27.*"
COPY server.py .
USER pwuser
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9000"]
