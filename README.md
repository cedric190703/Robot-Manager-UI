# Robot Manager - UI to manage the lerobot SO101/SO100 robotic arms

## Project Summary

Robot Manager is a full-stack application for controlling LeRobot hardware through an intuitive web interface. The system features a modular Python backend with FastAPI and a modern React TypeScript frontend with a tabbed interface.

## Architecture

### Backend Structure (Modular Design)

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI application factory
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py             # API endpoint handlers
│   ├── core/
│   │   ├── __init__.py
│   │   └── config.py             # Settings and configuration
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py            # Pydantic models
│   └── services/
│       ├── __init__.py
│       ├── command_service.py    # Command execution logic
│       └── robot_service.py      # Robot-specific operations
├── main.py                        # Legacy entry point (for compatibility)
├── requirements.txt
└── ARCHITECTURE.md
```

### Frontend Structure (Tabbed Interface)

```
frontend/
├── src/
│   ├── App.tsx                   # Main app with tab navigation
│   ├── App.css                   # Tabbed layout styles
│   ├── api/robotApi.ts          # Backend API client
│   └── components/              # UI components
```

## Quick Start

```bash
# Start both services
docker compose up --build 

# Backend: http://localhost:8000
# Frontend: http://localhost:5173
# API Docs: http://localhost:8000/docs
```