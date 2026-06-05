import subprocess
import sys

# Try connecting with 'ayush' user
r = subprocess.run(
    ['psql', '-h', '127.0.0.1', '-U', 'ayush', '-c', 'SELECT version();'],
    capture_output=True, text=True, timeout=10
)
sys.stdout.write("=== psql ayush STDOUT ===\n")
sys.stdout.write(r.stdout + "\n")
sys.stdout.write("=== psql ayush STDERR ===\n")
sys.stdout.write(r.stderr + "\n")
sys.stdout.write(f"RC={r.returncode}\n")

# Try with postgres user
r2 = subprocess.run(
    ['psql', '-h', '127.0.0.1', '-U', 'postgres', '-c', 'SELECT version();'],
    capture_output=True, text=True, timeout=10
)
sys.stdout.write("=== psql postgres STDOUT ===\n")
sys.stdout.write(r2.stdout + "\n")
sys.stdout.write("=== psql postgres STDERR ===\n")
sys.stdout.write(r2.stderr + "\n")
sys.stdout.write(f"RC={r2.returncode}\n")
sys.stdout.flush()
