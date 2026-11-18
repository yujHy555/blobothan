$ErrorActionPreference = 'Continue'
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev' -WorkingDirectory 'C:\Users\rorym\OneDrive\Desktop\Blobothan' -PassThru -WindowStyle Hidden
Write-Output "Started PID $($proc.Id)"
Start-Sleep -Seconds 14
try {
  $res = Invoke-WebRequest -Uri 'http://localhost:3000/' -TimeoutSec 15 -UseBasicParsing
  Write-Output "HTTP $($res.StatusCode)"
} catch {
  Write-Output "ERR $($_.Exception.Message)"
}
