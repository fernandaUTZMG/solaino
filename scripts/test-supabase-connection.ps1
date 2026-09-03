# Prueba de red hacia Supabase (ejecutar en la PC problemática).
# Clic derecho → Ejecutar con PowerShell, o en PowerShell:
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\scripts\test-supabase-connection.ps1

$SupabaseUrl = "https://erufiabtwfcnvkqckeow.supabase.co"
$HealthUrl = "$SupabaseUrl/auth/v1/health"

Write-Host ""
Write-Host "=== Prueba SOLAINO / Supabase ===" -ForegroundColor Cyan
Write-Host "URL: $SupabaseUrl"
Write-Host ""

function Test-Get($label, $uri) {
  Write-Host "[$label]" -ForegroundColor Yellow
  try {
    $r = Invoke-WebRequest -Uri $uri -UseBasicParsing -TimeoutSec 15
    Write-Host "  OK  HTTP $($r.StatusCode)" -ForegroundColor Green
    if ($r.Content) {
      $preview = $r.Content.ToString().Trim()
      if ($preview.Length -gt 120) { $preview = $preview.Substring(0, 120) + "..." }
      Write-Host "  $preview"
    }
    return $true
  } catch {
    Write-Host "  FALLO  $($_.Exception.Message)" -ForegroundColor Red
    return $false
  }
  Write-Host ""
}

$ok1 = Test-Get "Navegador / PowerShell (raíz)" $SupabaseUrl
$ok2 = Test-Get "API Auth (lo que usa SOLAINO al entrar)" $HealthUrl

Write-Host ""
if ($ok1 -and $ok2) {
  Write-Host "RESULTADO: La red de esta PC SI llega a Supabase." -ForegroundColor Green
  Write-Host "Si SOLAINO sigue con Failed to fetch, excluye SOLAINO.exe del antivirus" -ForegroundColor Green
  Write-Host "o reinstala el setup oficial." -ForegroundColor Green
} elseif ($ok1 -and -not $ok2) {
  Write-Host "RESULTADO: La raíz abre pero Auth NO. Firewall filtra rutas /auth." -ForegroundColor Red
  Write-Host "Pide a TI permitir $SupabaseUrl/auth/* (HTTPS 443)." -ForegroundColor Red
} else {
  Write-Host "RESULTADO: Esta PC NO llega a Supabase." -ForegroundColor Red
  Write-Host "Prueba con internet del celular (hotspot). Si con hotspot funciona," -ForegroundColor Red
  Write-Host "el bloqueo es la red de la planta." -ForegroundColor Red
}
Write-Host ""
