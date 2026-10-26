# Publish the working copy, make the NAS redeploy it, wait until the NAS runs exactly this build, then run the
# end-to-end smoke test against it. Everything happens from the PC; nothing to do on the NAS after setup.
#
# Settings come from working-files\nas.env (never published), lines like:
#   NAS_URL=http://<nas>:8765
#   DOCKHAND_DEPLOY=http://<dockhand>/api/git/stacks/<stackId>/deploy     (optional: without it, redeploy by hand)
#   DOCKHAND_TOKEN=<Dockhand API token>                                    (only when Dockhand login is on)
# Not the stack webhook: Dockhand's webhook only redeploys when files under deploy/ changed, and an app update
# changes only the image, so it is always skipped. The deploy endpoint forces a redeploy, which pulls :latest.
param([switch]$SkipPublish, [int]$TimeoutMinutes = 25)
$ErrorActionPreference = "Stop"
$app = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path (Split-Path $app -Parent) "working-files\nas.env"
$cfg = @{}
if (Test-Path $envFile) { Get-Content $envFile | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.+?)\s*$' } | ForEach-Object { $cfg[$Matches[1]] = $Matches[2] } }
$nas = $cfg["NAS_URL"]; if (-not $nas) { throw "set NAS_URL in $envFile (see deploy/README.md)" }
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = "$env:LOCALAPPDATA\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\python.exe" }

if (-not $SkipPublish) { & (Join-Path $app "publish-github.ps1") -Message "Update" }
$want = (& $py (Join-Path $app "version.py")).Trim()
"local build: $want"

# the NAS pulls the image GitHub Actions builds from the pushed commit: wait for that build first
$public = Join-Path (Split-Path (Split-Path $app -Parent) -Parent) "vault-configurator-public"
$sha = (git -C $public rev-parse HEAD).Trim()
$run = $null
for ($i = 0; $i -lt 30 -and -not $run; $i++) {
    $run = gh run list --repo marcelfarres/vault-configurator --workflow docker --commit $sha --json databaseId --jq '.[0].databaseId' 2>$null
    if (-not $run) { Start-Sleep 5 }
}
if ($run) { "waiting for image build (run $run)"; gh run watch $run --repo marcelfarres/vault-configurator --exit-status | Out-Null; if ($LASTEXITCODE) { throw "image build failed: gh run view $run --repo marcelfarres/vault-configurator --log-failed" } }
else { "no image build found for $sha (nothing new published?); redeploying the current image" }

if ($cfg["DOCKHAND_DEPLOY"]) {
    $headers = @{}
    if ($cfg["DOCKHAND_TOKEN"]) { $headers["Authorization"] = "Bearer " + $cfg["DOCKHAND_TOKEN"] }
    # answers with a log stream that Dockhand cuts off when it is done ("response ended prematurely"):
    # the build poll below is the real check
    try { $r = Invoke-WebRequest -UseBasicParsing -Method POST -Uri $cfg["DOCKHAND_DEPLOY"] -Headers $headers -TimeoutSec 900; "deploy: HTTP $($r.StatusCode)" }
    catch { if ($_.Exception.Response) { throw "Dockhand deploy refused: $($_.Exception.Message)" }; "deploy: $($_.Exception.Message)" }
} else { "no DOCKHAND_DEPLOY set: redeploy the stack in Dockhand, then the NAS is checked below" }

$deadline = (Get-Date).AddMinutes($TimeoutMinutes)
do {
    Start-Sleep 20
    try { $got = (Invoke-RestMethod "$nas/api/meta" -TimeoutSec 15).build } catch { $got = "(down: rebuilding?)" }
    "NAS build: $got"
} until ($got -eq $want -or (Get-Date) -gt $deadline)
if ($got -ne $want) { throw "the NAS did not reach build $want within $TimeoutMinutes minutes" }

& $py -X utf8 (Join-Path $PSScriptRoot "smoke_test.py") $nas
