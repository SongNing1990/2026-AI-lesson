$RootDir = Split-Path -Parent $PSScriptRoot
$RootDir = Split-Path -Parent $RootDir

Set-Location "$RootDir\apps\api"
python -m venv .venv
& ".\.venv\Scripts\Activate.ps1"
pip install -r requirements.txt

Set-Location "$RootDir\apps\web"
npm install

Write-Output "Bootstrap finished."
