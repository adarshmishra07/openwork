"""
Logger utility for space runtime.
"""
import logging
import sys
from typing import Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(levelname)s] %(asctime)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)]
)


class Logger:
    """Simple logger wrapper."""
    
    def __init__(self, name: str = "space-runtime"):
        self.logger = logging.getLogger(name)
    
    def info(self, message: str, **kwargs):
        self.logger.info(message)
    
    def debug(self, message: str, **kwargs):
        self.logger.debug(message)
    
    def warning(self, message: str, **kwargs):
        self.logger.warning(message)
    
    def error(self, message: str, exc_info: bool = False, **kwargs):
        self.logger.error(message, exc_info=exc_info)
    
    def critical(self, message: str, usecase: Optional[str] = None, **kwargs):
        self.logger.critical(f"[{usecase}] {message}" if usecase else message)


# Global logger instance
log = Logger()
