## MSSQL-MCP-API-Gateway

인증 및 요청 제어를 담당하는 MCP API 게이트웨이이다.

시스템 아키텍처

```
Claude AI (클라이언트)
    ↓ [MCP Protocol - stdio]
MCP 서버 (Python - FastMCP)
    ↓ [HTTP/HTTPS REST API]
API Gateway (Node.js + Express)
    ↓ [MSSQL 프로토콜]
MSSQL Database
```

설치


```bash
npm install
```

실행

```bash
node server.js
```


환경 변수

```bash
# .env
API_GATEWAY_URL=endpoint
API_KEY=apikey

# MSSQL 연결 (API Gateway용)
DB_SERVER=localhost
DB_NAME=database_name
DB_USER=username
DB_PASSWORD=password
```