import subprocess
import time
import os

results = []

def run(cmd, **kwargs):
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=30, **kwargs)
    results.append(f"CMD: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    results.append(f"RC={r.returncode}")
    results.append(f"OUT: {r.stdout[:500]}")
    results.append(f"ERR: {r.stderr[:500]}")
    results.append("---")
    return r

# Check if postgres service can be started
r = run(['sudo', 'systemctl', 'start', 'postgresql'])

time.sleep(3)

# Check status
r = run(['sudo', 'systemctl', 'status', 'postgresql'])

# Check if pg is ready now
r = run(['pg_isready', '-h', '127.0.0.1', '-p', '5432'])

# Write results
with open('/home/ayush/Foundership/ChekInExplara/pg_setup_result.txt', 'w') as f:
    f.write('\n'.join(results))
