# Scarica una copia di Node.js in .cache\node, solo per OnPeace: niente installazione nel sistema e niente
# permessi di amministratore. La lancia Serata.cmd quando sul PC non c'e' Node 22 o superiore.
# Prende l'ultima 24.x (quella con cui e' sviluppato OnPeace) da nodejs.org e la controlla con lo SHA256
# pubblicato. Per aggiornarla basta cancellare .cache\node.
# (Solo caratteri ASCII: PowerShell 5 legge gli script senza BOM con la codifica di sistema.)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # con la barra di avanzamento PowerShell 5 scarica lentissimo
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$base = 'https://nodejs.org/dist/latest-v24.x'
$root = Split-Path -Parent $PSScriptRoot
$cache = Join-Path $root '.cache'
$dest = Join-Path $cache 'node'
$zip = Join-Path $cache 'node-scaricato.zip'
$tmp = Join-Path $cache 'node-estrazione'

# PowerShell a 32 bit su Windows a 64 bit vede x86: il processore vero e' in PROCESSOR_ARCHITEW6432
$cpu = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$arch = switch ($cpu) { 'AMD64' { 'x64' } 'ARM64' { 'arm64' } default { 'x86' } }

try {
  $sums = (Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt").Content
  if ($sums -is [byte[]]) { $sums = [Text.Encoding]::UTF8.GetString($sums) }
  # righe "<sha256>  node-v24.x.y-win-x64.zip"
  $line = $sums -split "`n" | Where-Object { $_ -match "^[0-9a-f]{64}\s+node-v[0-9.]+-win-$arch\.zip\s*$" } | Select-Object -First 1
  if (-not $line) { throw "nodejs.org non ha Node 24 per Windows $arch" }
  $sha, $file = $line.Trim() -split '\s+'
  $name = $file -replace '\.zip$', ''

  Write-Host "[serata] scarico $name (circa 35 MB), una volta sola..."
  New-Item -ItemType Directory -Force $cache | Out-Null
  Invoke-WebRequest -UseBasicParsing "$base/$file" -OutFile $zip
  if ((Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower() -ne $sha) {
    Remove-Item -Force $zip
    throw 'il file scaricato non corrisponde allo SHA256 pubblicato'
  }

  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  New-Item -ItemType Directory $tmp | Out-Null
  # tar.exe (Windows 10 e successivi) e' molto piu' veloce di Expand-Archive
  if (Get-Command tar.exe -ErrorAction SilentlyContinue) {
    tar.exe -xf $zip -C $tmp
    if ($LASTEXITCODE -ne 0) { throw "non riesco a estrarre $file" }
  } else {
    Expand-Archive -Path $zip -DestinationPath $tmp
  }
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
  Move-Item (Join-Path $tmp $name) $dest
  Remove-Item -Recurse -Force $tmp, $zip
  Write-Host '[serata] Node pronto in .cache\node'
} catch {
  Write-Host "[serata] non riesco a scaricare Node: $($_.Exception.Message)"
  foreach ($p in @($tmp, $zip)) { if (Test-Path $p) { Remove-Item -Recurse -Force $p } }
  exit 1
}
