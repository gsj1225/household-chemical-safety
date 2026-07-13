# 排雷挑战 - 后端 Dockerfile
# 构建命令：docker build -t mine-challenge-api .
# 运行命令：docker run -p 8000:8000 --env-file .env mine-challenge-api

FROM python:3.12-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY . .

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
