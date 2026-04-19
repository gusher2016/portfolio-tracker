# Portfolio Tracker Argentino - Documentación

## 📋 Requerimientos Originales

### Stack Técnico
- **Backend**: Python con FastAPI
- **Frontend**: React (Vite)
- **Infraestructura**: Docker + docker-compose
- **DB**: SQLite (MVP)

### Funcionalidades Requeridas
1. **Acciones y CEDEARs**: Integración con Yahoo Finance (yfinance) usando tickers `.BA`
2. **Bonos Soberanos y ONs**: Precios desde BYMA API
3. **Fondos Comunes de Inversión (FCI)**: Estructura para valor de cuotaparte
4. **Dashboard**: Tabla de posiciones + gráfico de torta (Recharts/Chart.js)

---

## ✅ Progreso Completado

### 1. Backend (FastAPI)
- ✅ Endpoints REST: `/api/activos` (GET, POST, DELETE)
- ✅ Integración Yahoo Finance para acciones/CEDEARs con tickers `.BA`
- ✅ Integración BYMA API para bonos y ONs (POST method, verify=False)
- ✅ Cálculo de valorización en ARS y USD
- ✅ Cálculo de ganancia/pérdida
- ✅ Tipo de cambio desde API BCRA

### 2. Frontend (React + Vite)
- ✅ Dashboard con tabla de activos
- ✅ Gráfico de torta por tipo de activo
- ✅ Modal para crear/editar inversiones
- ✅ Métricas: Total invertido, valor actual, G/P

### 3. Docker
- ✅ Dockerfile para backend
- ✅ Dockerfile para frontend  
- ✅ docker-compose.yml

### 4. Problemas Resueltos
- ✅ Schema DB incompatible (columna `precio_compra` obsoleta) → se recreó la DB
- ✅ BYMA API no funcionaba → se cambió a POST con `json={"excludeZeroVolume": False}` y `verify=False`
- ✅ Precios mock eliminados → ahora retorna error si no hay precio
- ✅ Mejor manejo de errores en frontend

---

## 🚧 Pendiente / Known Issues

### 1. Errores de CORS
- El error `CORS header 'Access-Control-Allow-Origin' missing` aparece a veces
- El backend tiene CORS configurado con `allow_origins=["*"]`
- **Solución parcial**: Mejor logging de errores en frontend

### 2. Edición de Activos
- El frontend usa enfoque "delete + recreate" para editar
- Puede fallar si el delete falla por algún motivo
- **Mejorar**: Implementar endpoint PUT `/api/activos/{id}`

### 3. Datos de Prueba
- La DB se limpia al reiniciar (no hay datos persistentes en Docker)
- **Agregar**: Seed data o backup de la DB

### 4. Precio AL30
- ✅ Ahora funciona: 90,190 ARS (directo de BYMA)
- El ticker AL30 no existe en Yahoo Finance, solo en BYMA

### 5. Rava API
- No está funcionando (DNS resolution failed)
- **Investigar**: Endpoint correcto o eliminar

---

## 🔧 Comandos Útiles

```bash
# Desarrollo local (sin Docker)
cd backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8080
cd frontend && npm run dev

# Con Docker
docker compose build
docker compose up -d

# Ver logs
docker compose logs -f

# Reset DB
rm backend/portfolio.db
```

---

## 📁 Estructura

```
/workspace/project/
├── backend/
│   ├── main.py          # FastAPI app
│   ├── portfolio.db     # SQLite DB
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx      # Main component
│   │   └── App.css
│   ├── dist/            # Build output
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 🔑 Variables de Entorno

- `PYTHONUNBUFFERED=1` (para ver logs en tiempo real)
- Puerto backend: 8080
- Puerto frontend: 80 (nginx) o 8081 (dev)

---

## 📝 Notas para Continuación

1. **Testear edición**: Verificar que el delete+create funciona bien
2. **Agregar más activos de prueba**: GGAL, YPF, AAPL, AL30, GD30, etc.
3. **Mejorar UI**: Agregar sorting, filtering, paginación
4. **Persistir datos**: Hacer backup de portfolio.db o usar volumen Docker
5. **Agregar PUT endpoint**: Para actualización real de activos