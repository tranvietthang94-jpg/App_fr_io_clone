@echo off
rem Daily Postgres backup — run by Task Scheduler (task "frclone-pgdump", 02:00 daily).
rem DB is small (metadata only; videos live on disk) — plain SQL dump, keep 14 days.
setlocal
set PGBAK=F:\frclone-backups
if not exist "%PGBAK%" mkdir "%PGBAK%"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -F yyyy-MM-dd"') do set TODAY=%%i
docker exec app_frio_01-postgres-1 pg_dumpall -U frclone > "%PGBAK%\pg-%TODAY%.sql"
forfiles /P "%PGBAK%" /M pg-*.sql /D -14 /C "cmd /c del @path" 2>nul
endlocal
