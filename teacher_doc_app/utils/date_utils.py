from __future__ import annotations

from datetime import datetime


def today(fmt: str = "%Y-%m-%d") -> str:
    return datetime.now().strftime(fmt)


def days_between(start: str, end: str, fmt: str = "%Y-%m-%d", inclusive: bool = True) -> str:
    s = datetime.strptime(start, fmt)
    e = datetime.strptime(end, fmt)
    diff = (e - s).days
    if inclusive:
        diff += 1
    return str(diff)
