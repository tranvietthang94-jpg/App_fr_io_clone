# Portable local Postgres + Redis (no Docker), bound to 127.0.0.1 only.
# Binaries live in .devenv/ (gitignored): pgsql/, pgdata/, redis/, redisdata/.
# Usage: powershell -File scripts/devenv.ps1 start|stop|status
param([Parameter(Mandatory)][ValidateSet('start', 'stop', 'status')][string]$Action)

$ErrorActionPreference = 'Stop'
$dev = Join-Path (Split-Path $PSScriptRoot -Parent) '.devenv'
$pgctl = "$dev\pgsql\bin\pg_ctl.exe"
$pgready = "$dev\pgsql\bin\pg_isready.exe"
$redis = "$dev\redis\redis-server.exe"
$rcli = "$dev\redis\redis-cli.exe"

function Test-Pg { & $pgready -h 127.0.0.1 -p 5432 -q; $LASTEXITCODE -eq 0 }
function Test-Redis { try { (& $rcli -h 127.0.0.1 -p 6379 ping 2>$null) -eq 'PONG' } catch { $false } }

switch ($Action) {
  'start' {
    # Start-Process (not `& pg_ctl start`): the postmaster inherits the caller's
    # stdout pipe and would keep this shell hanging forever.
    if (-not (Test-Pg)) {
      Start-Process $pgctl -WindowStyle Hidden -ArgumentList "start -w -D `"$dev\pgdata`" -l `"$dev\postgres.log`" -o `"-c listen_addresses=127.0.0.1`""
    }
    if (-not (Test-Redis)) {
      Start-Process $redis -WindowStyle Hidden -WorkingDirectory "$dev\redisdata" `
        -RedirectStandardOutput "$dev\redis.log" -RedirectStandardError "$dev\redis.err.log" `
        -ArgumentList '--bind 127.0.0.1 --port 6379 --dir .'
    }
    1..30 | ForEach-Object { if ((Test-Pg) -and (Test-Redis)) { return }; Start-Sleep -Milliseconds 500 }
  }
  'stop' {
    if (Test-Redis) { & $rcli -h 127.0.0.1 -p 6379 shutdown nosave 2>$null | Out-Null }
    if (Test-Pg) { Start-Process $pgctl -WindowStyle Hidden -Wait -ArgumentList "stop -m fast -D `"$dev\pgdata`"" }
  }
}
Write-Host ("postgres 127.0.0.1:5432 : " + $(if (Test-Pg) { 'up' } else { 'down' }))
Write-Host ("redis    127.0.0.1:6379 : " + $(if (Test-Redis) { 'up' } else { 'down' }))
