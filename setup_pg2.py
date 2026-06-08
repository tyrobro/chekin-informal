import subprocess
import time

results = []

def run(cmd, **kwargs):
    if isinstance(cmd, str):
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30, **kwargs)
    else:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=30, **kwargs)
    results.append(f"CMD: {cmd}")
    results.append(f"RC={r.returncode}")
    results.append(f"OUT: {r.stdout[:800]}")
    results.append(f"ERR: {r.stderr[:800]}")
    results.append("---")
    return r

# Check pg_ctl path
r = run(['which', 'pg_ctl'])
r = run(['pg_ctl', '--version'])

# Check for postgres data dir
r = run(['find', '/var/lib/postgres', '-name', 'PG_VERSION', '-maxdepth', '3'])
r = run(['find', '/var/lib', '-name', 'PG_VERSION', '-maxdepth', '5'])

# Check if we can run initdb path
r = run(['find', '/usr', '-name', 'initdb', '-maxdepth', '10'])

# Check postgres socket
r = run(['find', '/var/run', '-name', '.s.PGSQL*', '-maxdepth', '5'])
r = run(['ls', '-la', '/var/run/postgresql/'])

# Check if there's a socket we can use (peer auth)
r = run(['psql', '-U', 'postgres', '-c', 'SELECT 1;'])
r = run(['psql', '-U', 'ayush', '-c', 'SELECT 1;'])

# Write results
with open('/home/ayush/Foundership/ChekInExplara/pg_setup_result2.txt', 'w') as f:
    f.write('\n'.join(results))
