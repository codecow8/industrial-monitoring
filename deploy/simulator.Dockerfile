FROM python:3.12-slim
WORKDIR /app
COPY services/simulator/simulator.py ./
ENV PYTHONUNBUFFERED=1
USER 10001:10001
CMD ["python", "simulator.py"]
