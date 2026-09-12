import datetime
import json
import re


def should_pause(task, code):
    # Reporting failures must never stop the jobs needed to recover.
    return task != "health" and code != 0 and not (task == "digest" and code in (10, 11))


def pause_context(path):
    """Bounded, allowlisted metadata only; never send arbitrary PAUSED contents."""
    if not path.exists():
        return None
    result = {"task": "unknown", "reason": "pause_metadata_unavailable",
              "time": "unknown", "log": "unavailable"}
    try:
        result["time"] = datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc).isoformat()
        with path.open('rb') as f:
            raw = f.read(4097)
        if len(raw) > 4096:
            return result
        data = json.loads(raw)
        if not isinstance(data, dict):
            return result
        if data.get('task') in ('crawler', 'digest', 'health'):
            result['task'] = data['task']
        reason = data.get('reason')
        if isinstance(reason, str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', reason):
            result['reason'] = reason
        timestamp = data.get('time')
        if isinstance(timestamp, str) and re.fullmatch(r'[0-9T:+.Z-]{10,40}', timestamp):
            result['time'] = timestamp
        log = data.get('log')
        if isinstance(log, str) and re.fullmatch(r'/var/lib/hitnotice-daily/logs/[A-Za-z0-9_.-]+', log):
            result['log'] = log
    except (OSError, ValueError):
        pass
    return result
