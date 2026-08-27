import sys
import os

# Garante que a raiz do projeto está no path
sys.path.insert(0, os.path.dirname(__file__))

from backend.app import app

if __name__ == "__main__":
    app.run()
