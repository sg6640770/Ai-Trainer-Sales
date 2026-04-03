#!/bin/bash
echo "Starting backend..."
cd backend
pip install -r requirements.txt -q
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "Starting frontend..."
cd ../frontend
npm install -q
npm run dev -- --host 0.0.0.0 --port 5000 &
FRONTEND_PID=$!

echo "Both servers running"
echo "Backend: http://0.0.0.0:8000"
echo "Frontend: http://0.0.0.0:5173"

wait $BACKEND_PID $FRONTEND_PID
```

---

## Backend Files

**`backend/requirements.txt`**
```
fastapi==0.115.0
uvicorn==0.30.6
websockets==12.0
httpx==0.27.2
python-dotenv==1.0.1
openai==1.50.0
python-multipart==0.0.12
python-jose==3.3.0