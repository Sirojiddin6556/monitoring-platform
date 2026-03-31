"""Configuration module - environment variables and constants"""

import os
from pathlib import Path

# Database
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./monitoring.db')

# API
API_KEY = os.getenv('API_KEY', 'your-secret-api-key-change-in-production')
HOST = os.getenv('HOST', '127.0.0.1')
PORT = int(os.getenv('PORT', 8000))

# JWT
SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = 'HS256'
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# Thresholds (defaults)
DEFAULT_CPU_THRESHOLD = int(os.getenv('DEFAULT_CPU_THRESHOLD', 80))
DEFAULT_MEMORY_THRESHOLD = int(os.getenv('DEFAULT_MEMORY_THRESHOLD', 85))
DEFAULT_DISK_THRESHOLD = int(os.getenv('DEFAULT_DISK_THRESHOLD', 90))
DEFAULT_NETWORK_THRESHOLD = int(os.getenv('DEFAULT_NETWORK_THRESHOLD', 1000))

# Debug
DEBUG = os.getenv('DEBUG', 'false').lower() in ('1', 'true', 'yes')
