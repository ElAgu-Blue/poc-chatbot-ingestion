# Runbook local de la PoC

## Requisitos

- Windows PowerShell.
- Node.js 24 (`nvm use 24`).
- Docker Desktop con Compose v2.
- Para BigQuery/Dataform: `gcloud`, `bq` y acceso autorizado al proyecto
  `bx-b2cc2x-dev`. No se requieren credenciales reales para la validación local
  anterior al bridge.

## 1. Dependencias e infraestructura

Desde la carpeta `poc-chatbot-ingestion`:

```powershell
nvm use 24
npm ci
Copy-Item .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs localstack-init
```

`mongo` y `localstack` deben figurar como `healthy`. El inicializador debe
terminar con código 0 y crear de forma idempotente:

- `topic-oneblue-chat-interactions`;
- `queue-oneblue-chat-interactions-mover`;
- `queue-oneblue-chat-interactions-mover-dlq`;
- redrive a la DLQ tras 3 intentos;
- política que sólo acepta publicación desde el topic.

Puede volver a ejecutarse con:

```powershell
docker compose rm -f localstack-init
docker compose up -d --force-recreate localstack-init
docker compose logs localstack-init
```

El mismo comando construye y levanta BFF/BFA en la red de Compose:

- Mongo dentro de Docker: `mongodb://mongo:27017/oneblue_chat`.
- BFA: `http://127.0.0.1:3001/health/liveness`.
- BFF: `http://127.0.0.1:3000/b2cc2x/oneblue/health/liveness`.
- BFF → BFA: `http://bfa:3001/v1`.

Compruebe ambos servicios con:

```powershell
docker compose ps bfa bff
Invoke-RestMethod http://127.0.0.1:3001/health/liveness
Invoke-RestMethod http://127.0.0.1:3000/b2cc2x/oneblue/health/liveness
```

El puerto 3001 queda ocupado por el BFA; detenga ese servicio antes de correr
`npm run simulate`, que usa el mismo puerto:

```powershell
docker compose stop bfa bff
```

## 2. Validar Mongo, SNS y SQS

```powershell
npm run seed
docker compose exec localstack awslocal sqs receive-message `
  --queue-url http://localstack:4566/000000000000/queue-oneblue-chat-interactions-mover
docker compose exec mongo mongosh --quiet oneblue_chat `
  --eval "db.conversations.find({}, {_id:0, conversationId:1, status:1}).toArray()"
```

El seeder es idempotente: repetirlo conserva un único turno y un único cierre,
así que no debe generar un segundo evento. El mensaje SQS es un sobre SNS; el
payload está en `Message` y los atributos gobernados están en
`MessageAttributes`.

Para volver a generar una entrega local desde cero:

```powershell
npm run seed:reset
docker compose exec localstack awslocal sqs get-queue-attributes `
  --queue-url http://localstack:4566/000000000000/queue-oneblue-chat-interactions-mover `
  --attribute-names ApproximateNumberOfMessages
```

`seed:reset` sólo elimina las conversaciones fixture `conv-pyme-001` y
`conv-b2b-001`; no toca conversaciones reales o creadas con otros IDs.

### MongoDB Compass

Desde una Compass instalada en el host Windows, conectarse con:

```text
mongodb://127.0.0.1:27017/oneblue_chat
```

No se requiere usuario ni contraseña en esta PoC. La URI interna disponible
entre contenedores es `mongodb://mongo:27017/oneblue_chat`.

## 3. Simulador HTTP

En una terminal:

```powershell
npm run simulate
```

Ejemplos Windows:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/v1/chatbot `
  -ContentType application/json `
  -InFile .\src\fixtures\pyme-conversation.json

Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3001/v1/chatbot/survey `
  -ContentType application/json `
  -InFile .\src\fixtures\b2b-survey.json
```

`/v1/chatbot` conserva el shape simulado de Dialogflow. `/survey` responde
`{"text":"request accepted","conversationId":"..."}` y publica sólo si el
cierre fue nuevo.

## 4. Google Cloud, `bq` y BigQuery

Instalar las herramientas y paquetes necesarios:

```powershell
winget install --id Google.CloudSDK -e
npm install --save-dev @dataform/cli
gcloud components update
```

Abra una terminal nueva tras instalar Google Cloud SDK. Compruebe:

```powershell
gcloud --version
bq --version
npx dataform --version
```

### Opción A: cuenta de servicio del BFA (recomendada)

El bridge replica la autenticación de `DialogflowAdapter`: lee
`GCP_SA_INTGR_BFA` y crea explícitamente las credenciales de BigQuery. La
variable admite:

- JSON completo en una línea;
- JSON codificado en base64;
- ruta local al JSON;
- URI `file://` apuntando al JSON.

Copie en `.env` el mismo valor corporativo configurado en BFA:

```dotenv
GCP_PROJECT_ID=bx-b2cc2x-dev
GCP_SA_INTGR_BFA={"client_email":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n..."}
```

También puede almacenarlo fuera del repositorio:

```dotenv
GCP_SA_INTGR_BFA=file://C:\ruta-segura\service-account.json
```

No publique ni versioné el JSON. Reinicie VS Code para refrescar el debugger y
ejecute `PoC - Debug bridge`; no necesita ADC ni `gcloud auth login`.

Desde código, con la misma credencial `GCP_SA_INTGR_BFA`:

```powershell
npm run bigquery:init
```

El comando es idempotente: crea el dataset `chat_analytics` en `US` y la tabla
`evs_chat_conversations` con schema, partición y clustering sólo cuando no
existen. La cuenta de servicio necesita permisos para crear datasets y tablas.

### Opción B: Application Default Credentials

Si `GCP_SA_INTGR_BFA` queda vacío, el cliente de BigQuery vuelve a usar ADC:

```powershell
gcloud config set project bx-b2cc2x-dev
gcloud auth application-default login
gcloud auth application-default print-access-token
gcloud services enable bigquery.googleapis.com dataform.googleapis.com
bq query --use_legacy_sql=false --project_id=bx-b2cc2x-dev `
  --flagfile=sql\create_evs_chat_conversations.sql
```

La cuenta debe tener acceso al proyecto `bx-b2cc2x-dev`. Para una sandbox donde
la misma cuenta crea dataset y tablas, se necesita `roles/bigquery.admin` o
permisos equivalentes. Si el dataset ya existe, use como mínimo
`roles/bigquery.dataEditor` y `roles/bigquery.jobUser`; habilitar APIs puede
requerir permisos para `serviceusage.services.enable`. Para Dataform, añada
`roles/dataform.editor` si el administrador corporativo utiliza IAM de esa
plataforma.

Si `bq` de una instalación concreta no acepta `--flagfile`, use:

```powershell
Get-Content .\sql\create_evs_chat_conversations.sql -Raw |
  bq query --use_legacy_sql=false --project_id=bx-b2cc2x-dev
```

Con la tabla creada, ejecute:

```powershell
npm run bridge
```

El bridge elimina cada mensaje SQS sólo después de una inserción BigQuery
exitosa. Un reintento puede duplicar RAW por entrega al menos una vez; el mart
deduplica por `conversationId` y orden `closedAt/occurredAt/ingestedAt`.

Validación:

```powershell
bq query --use_legacy_sql=false --project_id=bx-b2cc2x-dev "
SELECT conversationId, COUNT(DISTINCT eventId) AS events
FROM \`bx-b2cc2x-dev.chat_analytics.evs_chat_conversations\`
GROUP BY conversationId"
```

## 5. Dataform

Desde `dataform`:

```powershell
npx dataform install
npx dataform compile
npx dataform run
```

Para depurar `seed.ts` y `bridge.ts`, use las configuraciones
`PoC - Debug seed` y `PoC - Debug bridge` de `.vscode\launch.json`.

Se consulta `daily_chatbot_summary`, nunca el RAW, desde el informe. El SQLX
aplica `NULLIF` a tasas y conserva `datetimeMetadata`.

## 6. Pruebas y cierre

```powershell
npm test -- --runInBand
npm run build
docker compose down
```

Para borrar también los datos locales:

```powershell
docker compose down -v
```

No se registra cuerpo completo, correo, comentario o historial. Los errores
de Mongo, SNS y BigQuery deben permanecer visibles y no se convierten en
respuestas exitosas.
