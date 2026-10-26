param([string]$JavaHome = $env:JAVA_HOME)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'DevelopmentEnvironment.ps1')
$repositoryRoot = Split-Path $PSScriptRoot -Parent
$settings = Get-DevelopmentEnvironment -RepositoryRoot $repositoryRoot
Set-DevelopmentJavaHome -JavaHome $JavaHome

# Use a separate database: integration fixtures never enter the application database.
$composeArguments = @('compose', '--project-directory', $repositoryRoot, '--env-file', (Join-Path $repositoryRoot '.env'))
& docker @composeArguments up -d --wait database
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not become healthy.' }

$existingDatabase = & docker @composeArguments exec -T database psql -U family_medicine -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='family_medicine_test'"
if ($LASTEXITCODE -ne 0) { throw 'Could not check the integration-test database.' }
if (($existingDatabase -join '').Trim() -ne '1') {
    & docker @composeArguments exec -T database createdb -U family_medicine family_medicine_test
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the integration-test database.' }
}

$previousSettings = @{}
foreach ($name in @('TEST_DATABASE_URL', 'TEST_DATABASE_USER', 'TEST_DATABASE_PASSWORD')) {
    $previousSettings[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
try {
    $env:TEST_DATABASE_URL = "jdbc:postgresql://localhost:$($settings['DATABASE_PORT'])/family_medicine_test"
    $env:TEST_DATABASE_USER = 'family_medicine'
    $env:TEST_DATABASE_PASSWORD = $settings['DATABASE_PASSWORD']
    Write-Output 'Running the backend suite against the isolated PostgreSQL test database.'
    Push-Location (Join-Path $repositoryRoot 'backend')
    try {
        & mvn "-Dmaven.repo.local=$(Join-Path $repositoryRoot '.m2')" test -B --no-transfer-progress
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL integration tests failed. Check backend/target/surefire-reports.' }
    } finally { Pop-Location }
} finally {
    foreach ($name in $previousSettings.Keys) {
        [Environment]::SetEnvironmentVariable($name, $previousSettings[$name], 'Process')
    }
}
