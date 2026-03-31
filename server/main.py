"""Server entrypoint - run with: python -m server.main or uvicorn server.app:app"""

import uvicorn
import os
from .config import HOST, PORT
from .app import app


if __name__ == '__main__':
    debug = os.getenv('DEBUG', '').lower() in ('1', 'true', 'yes')
    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        reload=debug
    )
