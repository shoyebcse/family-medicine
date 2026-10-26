param([string]$JavaHome = $env:JAVA_HOME)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DevelopmentEnvironment.ps1')
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$settings = Get-DevelopmentEnvironment -RepositoryRoot $repositoryRoot
Set-DevelopmentJavaHome -JavaHome $JavaHome
if (-not $settings.ContainsKey('DEV_API_TOKEN') -or $settings['DEV_API_TOKEN'].Length -lt 24) {
    throw 'DEV_API_TOKEN must have at least 24 characters in the local .env file.'
}

$previousSettings = @{}
$names = @('SPRING_PROFILES_ACTIVE', 'DATABASE_URL', 'DATABASE_USER', 'DATABASE_PASSWORD', 'DEV_API_TOKEN', 'OPENAI_API_KEY', 'PRESCRIPTION_EXTRACTION_ENABLED', 'PRESCRIPTION_ENCRYPTION_KEY', 'OPENAI_LOG_RESPONSES', 'PRESCRIPTION_EXTRACTION_MODE')
foreach ($name in $names) { $previousSettings[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    $env:SPRING_PROFILES_ACTIVE = 'dev'
    $env:DATABASE_URL = "jdbc:postgresql://localhost:$($settings['DATABASE_PORT'])/family_medicine"
    $env:DATABASE_USER = 'family_medicine'
    $env:DATABASE_PASSWORD = $settings['DATABASE_PASSWORD']
    $env:DEV_API_TOKEN = $settings['DEV_API_TOKEN']
    foreach ($setting in @('OPENAI_API_KEY', 'PRESCRIPTION_EXTRACTION_ENABLED', 'PRESCRIPTION_ENCRYPTION_KEY', 'OPENAI_LOG_RESPONSES', 'PRESCRIPTION_EXTRACTION_MODE')) {
        if ($settings.ContainsKey($setting)) { [Environment]::SetEnvironmentVariable($setting, $settings[$setting], 'Process') }
    }
    Write-Output 'Starting the development API on localhost with PostgreSQL. Credentials are read from the gitignored .env.'
    Push-Location (Join-Path $repositoryRoot 'backend')
    try {
        & mvn "-Dmaven.repo.local=$(Join-Path $repositoryRoot '.m2')" spring-boot:run -B --no-transfer-progress
        if ($LASTEXITCODE -ne 0) { throw 'Backend startup failed.' }
    } finally { Pop-Location }
} finally {
    foreach ($name in $previousSettings.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousSettings[$name], 'Process')
    }
}



