# PoC de ingesta analítica del chatbot

Prueba de concepto tipada en TypeScript (Node.js 24) para el flujo
MongoDB → SNS → SQS → BigQuery, con mart diario en Dataform. Usa datos ficticios
y credenciales `test/test` únicamente para LocalStack.

## Inicio rápido (Windows PowerShell)

```powershell
nvm use 24
npm ci
Copy-Item .env.example .env
docker compose up -d
docker compose ps
npm run seed
npm test -- --runInBand
npm run build
```

`npm run simulate` levanta `POST /v1/chatbot` y
`POST /v1/chatbot/survey` en `http://127.0.0.1:3001`. Consulte
`docs\local-runbook.md` antes de ejecutar el bridge, BigQuery o Dataform.

El compose también construye BFF/BFA y los conecta a Mongo y LocalStack. La
URI para MongoDB Compass es `mongodb://127.0.0.1:27017/oneblue_chat`. El
runbook incluye instalación de `gcloud`, `bq`, Dataform, IAM y autenticación.

## Convenciones

- No se versionan credenciales, archivos de cuenta de servicio ni `.env`.
- La PII del RAW y del mart debe protegerse mediante IAM de BigQuery/Looker.
- El flujo es al menos una vez. `eventId` permite deduplicación en el mart.
- Mongo y SNS no son transaccionales; un fallo SNS posterior al cierre se
  propaga como error y constituye una ventana de consistencia conocida.
