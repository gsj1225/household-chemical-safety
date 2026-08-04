# 家庭化学品库 - 后端 Dockerfile
# 构建命令：docker build -t homechem-api .
# 运行命令：docker run -p 8000:8000 --env-file .env -v $(pwd)/data:/app/data homechem-api

FROM python:3.12-slim

WORKDIR /app

# 安装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY . .

# 数据持久化目录
VOLUME /app/data

# 暴露端口
EXPOSE 8000

# 启动命令
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
