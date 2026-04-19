# Portfolio Tracker Argentino

## Stack
- **Backend**: FastAPI (Python) - puerto 8080
- **Frontend**: React + Vite - puerto 80
- **DB**: SQLite
- **APIs**: Yahoo Finance (.BA), BYMA

## ✅ Completado
- Endpoints REST: activos (CRUD), portfolio summary, price-lookup
- Integración Yahoo Finance para acciones/CEDEARs
- Integración BYMA API para bonos/ONs
- Dashboard: tabla + gráfico torta (Recharts)
- Modal crear/editar inversiones
- Autocompletar precio/nombre al escribir ticker
- Cálculo automático USD desde ARS/exchange rate

## 🚧 Issues
- Rava API no funciona (DNS)
- CORS ocasional
- DB no persistente en Docker

## 🧪 Testing
```bash
# Backend
curl http://localhost:8080/api/activos
curl "http://localhost:8080/api/price-lookup?ticker=AL30&tipo=bono"

# Frontend
curl http://localhost:80
```

## 📦 Deploy
```bash
git pull origin master
docker compose up -d
```
