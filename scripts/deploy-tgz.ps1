Param(
  [string]$PiHost = "raspi.local",
  [string]$PiUser = "pi",
  [string]$DeployRoot = "/var/www/html"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobile = Join-Path $repo "ui4mobile.tgz"
$pc     = Join-Path $repo "ui4pc.tgz"

if (!(Test-Path $mobile) -or !(Test-Path $pc)) {
  throw "ui4mobile.tgz と ui4pc.tgz をリポジトリ直下に配置してください。"
}

scp $mobile "$PiUser@$PiHost:$DeployRoot/ui4mobile.tgz"
scp $pc     "$PiUser@$PiHost:$DeployRoot/ui4pc.tgz"

ssh "$PiUser@$PiHost" @"
  set -e
  sudo mkdir -p $DeployRoot/m $DeployRoot/pc
  sudo tar -xzf $DeployRoot/ui4mobile.tgz -C $DeployRoot/m --strip-components=1
  sudo tar -xzf $DeployRoot/ui4pc.tgz -C $DeployRoot/pc --strip-components=1
  rm -f $DeployRoot/ui4mobile.tgz $DeployRoot/ui4pc.tgz
"@
