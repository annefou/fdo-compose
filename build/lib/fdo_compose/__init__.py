"""fdo-compose: render a dashboard FAIR Digital Object as a web page.

The dashboard is an object in ROHub, not a configuration file: its panels,
their order, the renderer each asks for and the style are annotations on the
Research Object. This package reads them with fdo-consume and writes two pages:
the object itself, and the dashboard it describes.
"""

from .render import render  # noqa: F401
from .site import Dashboard, build  # noqa: F401

__version__ = "0.1.0"
