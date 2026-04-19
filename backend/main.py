"""
Argentine Investment Portfolio Tracker - Backend
MVP with FastAPI + SQLite + yfinance
"""

import os
import requests
import json
from datetime import datetime
from typing import List, Optional, Dict
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base

# Cache for BYMA/Rava prices
rava_cache = {}
rava_cache_timestamp = None
CACHE_DURATION_SECONDS = 300  # 5 minutes
from sqlalchemy.orm import sessionmaker, Session
import yfinance as yf
import urllib3

# Suppress SSL warning (for BYMA API with cert issues)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# BYMA API Endpoints
BYMA_ENDPOINTS = {
    "on": "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/negociable-obligations",
    "cedear": "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/cedears",
    "accion": "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/etf",
    "bono": "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/public-bonds"
}

# Cache for BYMA prices (to avoid excessive API calls)
byma_cache: Dict[str, Dict] = {}
cache_timestamp: Optional[datetime] = None
CACHE_DURATION_SECONDS = 60  # Cache prices for 1 minute

# Database setup
DATABASE_URL = "sqlite:///./portfolio.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Models (SQLAlchemy)
class ActivoDB(Base):
    __tablename__ = "activos"
    
    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String, nullable=False)  # accion, cedear, bono, on, fci
    ticker = Column(String, nullable=False)
    nombre = Column(String, nullable=False)
    cantidad = Column(Float, nullable=False)
    precio_compra_ars = Column(Float, nullable=False)
    precio_compra_usd = Column(Float, nullable=False)
    fecha_compra = Column(DateTime, default=datetime.now)
    # For bonds/ONs - paridad, TIR, cotizacion BYMA
    paridad = Column(Float, nullable=True)
    tir = Column(Float, nullable=True)
    cotizacion_byma = Column(Float, nullable=True)
    # For FCI - valor cuotaparte
    valor_cuotaparte = Column(Float, nullable=True)

# Pydantic Models
class ActivoCreate(BaseModel):
    tipo: str
    ticker: str
    nombre: str
    cantidad: float
    precio_compra_ars: float
    precio_compra_usd: float
    fecha_compra: Optional[datetime] = None
    paridad: Optional[float] = None
    tir: Optional[float] = None
    cotizacion_byma: Optional[float] = None
    valor_cuotaparte: Optional[float] = None

class ActivoResponse(BaseModel):
    id: int
    tipo: str
    ticker: str
    nombre: str
    cantidad: float
    precio_compra_ars: float
    precio_compra_usd: float
    fecha_compra: Optional[datetime]
    paridad: Optional[float]
    tir: Optional[float]
    cotizacion_byma: Optional[float]
    valor_cuotaparte: Optional[float]
    precio_actual_usd: Optional[float] = None
    precio_actual_ars: Optional[float] = None
    valorizacion_usd: Optional[float] = None
    valorizacion_ars: Optional[float] = None
    ganancia_perdida_usd: Optional[float] = None
    ganancia_perdida_ars: Optional[float] = None

class PortfolioSummary(BaseModel):
    total_invertido_ars: float
    total_invertido_usd: float
    valor_actual_ars: float
    valor_actual_usd: float
    ganancia_perdida_ars: float
    ganancia_perdida_usd: float
    rendimiento_porcentaje_ars: float
    rendimiento_porcentaje_usd: float

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Portfolio Argentino API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Helper function to get current price from Yahoo Finance
def get_current_price(ticker: str) -> Optional[float]:
    """Get current price from Yahoo Finance using yfinance"""
    try:
        # Argentine stocks use .BA suffix
        if not ticker.endswith('.BA') and not ticker.endswith('.AR'):
            ticker = f"{ticker}.BA"
        
        stock = yf.Ticker(ticker)
        info = stock.info
        # Try different price keys
        price = info.get('currentPrice') or info.get('regularMarketPrice')
        if price:
            return float(price)
    except Exception as e:
        print(f"Error fetching price for {ticker}: {e}")
    return None

# Mock BYMA prices (fallback if API fails)
def get_mock_byma_price(ticker: str) -> float:
    """Mock BYMA prices for demonstration"""
    mock_prices = {
        "AL30": 105.50,
        "AL30D": 98.20,
        "GD30": 112.30,
        "GD30D": 102.50,
        "TO21": 95.80,
        "ON-PYGRAM": 98.00,
        "ON-YPF": 101.50,
    }
    return mock_prices.get(ticker, 100.0)


def fetch_byma_prices() -> Dict[str, Dict]:
    """Fetch prices from BYMA API"""
    global byma_cache, cache_timestamp
    
    # Check if cache is still valid
    now = datetime.now()
    if cache_timestamp and byma_cache:
        time_diff = (now - cache_timestamp).total_seconds()
        if time_diff < CACHE_DURATION_SECONDS:
            return byma_cache
    
    # Fetch from BYMA API
    byma_cache = {"on": {}, "cedear": {}, "accion": {}, "bono": {}}
    
    for tipo, url in BYMA_ENDPOINTS.items():
        try:
            print(f"Fetching {tipo} from {url}...")  # Debug
            headers = {
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
            response = requests.post(
                url,
                json={"excludeZeroVolume": False},
                headers=headers,
                timeout=30,
                verify=False  # Ignore SSL cert issues
            )
            print(f"Status {tipo}: {response.status_code}, len: {len(response.text)}")  # Debug
            
            if response.status_code == 200:
                data = response.json()
                print(f"Data type for {tipo}: {type(data)}")  # Debug
                # Handle different response structures:
                # - ONs: returns list directly
                # - Bonds/CEDEARs: returns {"content": {"data": [...]}}
                if isinstance(data, list):
                    instruments = data
                    print(f"List length for {tipo}: {len(instruments)}")
                elif isinstance(data, dict):
                    if "content" in data and "data" in data["content"]:
                        instruments = data["content"]["data"]
                    elif "data" in data:
                        instruments = data["data"]
                    else:
                        instruments = []
                else:
                    instruments = []
                
                for inst in instruments:
                    symbol = inst.get("symbol", "").strip().upper()
                    if symbol:
                        # Priority: trade > settlementPrice > previousClosingPrice
                        price = inst.get("trade") or inst.get("settlementPrice") or inst.get("previousClosingPrice")
                        if price and float(price) > 0:
                            byma_cache[tipo][symbol] = float(price)
                
                print(f"Fetched {len(byma_cache[tipo])} {tipo} from BYMA API")
                # Debug: check for YPF
                if tipo == "on":
                    ypf_matches = [k for k in byma_cache[tipo].keys() if 'YPF' in k]
                    print(f"YPF matches in {tipo}: {ypf_matches[:5]}")
            else:
                print(f"BYMA API error for {tipo}: {response.status_code}")
        except Exception as e:
            print(f"Error fetching BYMA {tipo}: {e}")
    
    cache_timestamp = now
    return byma_cache


def get_byma_price(ticker: str, tipo: str) -> Optional[float]:
    """Get price from BYMA API for a specific ticker and type"""
    prices = fetch_byma_prices()
    ticker_upper = ticker.upper()
    
    # Try exact match first
    if ticker_upper in prices.get(tipo, {}):
        return prices[tipo][ticker_upper]
    
    # Try partial match (ticker might be in the symbol)
    tipo_prices = prices.get(tipo, {})
    for symbol, price in tipo_prices.items():
        if ticker_upper in symbol or symbol in ticker_upper:
            return price
    
    return None


def fetch_rava_prices() -> Dict[str, Dict]:
    """Fetch prices from Rava API (free Argentine financial data)"""
    global rava_cache, rava_cache_timestamp
    
    now = datetime.now()
    if rava_cache_timestamp and rava_cache:
        time_diff = (now - rava_cache_timestamp).total_seconds()
        if time_diff < CACHE_DURATION_SECONDS:
            return rava_cache
    
    rava_cache = {"bono": {}, "on": {}, "fci": {}}
    
    try:
        # Rava bonds endpoint
        url = "https://services.rava.com.ar/symbols/"
        headers = {"User-Agent": "Mozilla/5.0"}
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict) and "bonos" in data:
                for item in data["bonos"]:
                    ticker = item.get("simbolo", "")
                    price = item.get("ultimo", item.get("cierre", 0))
                    if ticker and price:
                        rava_cache["bono"][ticker.upper()] = float(price)
            if isinstance(data, dict) and "obligaciones" in data:
                for item in data["obligaciones"]:
                    ticker = item.get("simbolo", "")
                    price = item.get("ultimo", item.get("cierre", 0))
                    if ticker and price:
                        rava_cache["on"][ticker.upper()] = float(price)
            print(f"Fetched {len(rava_cache['bono'])} bonds from Rava")
        else:
            print(f"Rava API error: {response.status_code}")
    except Exception as e:
        print(f"Error fetching Rava prices: {e}")
    
    rava_cache_timestamp = now
    return rava_cache


def get_rava_price(ticker: str, tipo: str) -> Optional[float]:
    """Get price from Rava API for a specific ticker"""
    prices = fetch_rava_prices()
    ticker_upper = ticker.upper()
    
    if ticker_upper in prices.get(tipo, {}):
        return prices[tipo][ticker_upper]
    
    # Try partial match
    tipo_prices = prices.get(tipo, {})
    for symbol, price in tipo_prices.items():
        if ticker_upper in symbol or symbol in ticker_upper:
            return price
    
    return None

# API Endpoints
@app.get("/")
def read_root():
    return {"message": "Portfolio Argentino API", "version": "1.0.0"}

@app.get("/api/activos", response_model=List[ActivoResponse])
def list_activos(db: Session = Depends(get_db)):
    """List all investments with current valuations"""
    activos = db.query(ActivoDB).all()
    result = []
    exchange_rate = get_exchange_rate_value()
    
    for activo in activos:
        # Get current price based on type
        precio_actual = None
        
        if activo.tipo in ["accion", "cedear"]:
            # Try Yahoo Finance first
            precio_actual = get_current_price(activo.ticker)
            if not precio_actual:
                # Try BYMA as fallback
                precio_actual = get_byma_price(activo.ticker, activo.tipo)
        elif activo.tipo in ["bono", "on"]:
            # For bonds, try BYMA first, then Rava
            precio_actual = get_byma_price(activo.ticker, activo.tipo)
            if not precio_actual:
                precio_actual = get_rava_price(activo.ticker, activo.tipo)
            # Also check database fields
            if not precio_actual and activo.cotizacion_byma:
                precio_actual = activo.cotizacion_byma
            elif not precio_actual and activo.paridad:
                precio_actual = activo.paridad * 100
        elif activo.tipo == "fci":
            # For FCI, use valor_cuotaparte if set, otherwise use manual price or default
            precio_actual = activo.valor_cuotaparte
            # If no cuotaparte value, allow 0 for display (user can update later)
        
        # If no price available, raise error (except for FCI and ON which can have manual entry)
        if precio_actual is None or precio_actual == 0:
            if activo.tipo not in ["fci", "on"]:
                raise HTTPException(status_code=400, detail=f"No se pudo obtener precio para {activo.ticker}. Verifique que el ticker exista en Yahoo Finance (ej: GGAL.BA), BYMA o Rava.")
        
        precio_actual = precio_actual or 0
        
        # Convert to both currencies - all prices in ARS
        precio_actual_ars = precio_actual
        precio_actual_usd = precio_actual / exchange_rate if exchange_rate else 0
        
        # Valorización
        valorizacion_usd = activo.cantidad * precio_actual_usd
        valorizacion_ars = activo.cantidad * precio_actual_ars
        
        # Ganancia/Pérdida en USD (compare USD vs USD)
        ganancia_perdida_usd = valorizacion_usd - (activo.cantidad * activo.precio_compra_usd)
        
        # Ganancia/Pérdida en ARS (compare ARS vs ARS)
        inversion_ars = activo.cantidad * activo.precio_compra_ars
        ganancia_perdida_ars = valorizacion_ars - inversion_ars
        
        activo_response = ActivoResponse(
            id=activo.id,
            tipo=activo.tipo,
            ticker=activo.ticker,
            nombre=activo.nombre,
            cantidad=activo.cantidad,
            precio_compra_ars=activo.precio_compra_ars,
            precio_compra_usd=activo.precio_compra_usd,
            fecha_compra=activo.fecha_compra,
            paridad=activo.paridad,
            tir=activo.tir,
            cotizacion_byma=activo.cotizacion_byma,
            valor_cuotaparte=activo.valor_cuotaparte,
            precio_actual_usd=round(precio_actual_usd, 2),
            precio_actual_ars=round(precio_actual_ars, 2),
            valorizacion_usd=round(valorizacion_usd, 2),
            valorizacion_ars=round(valorizacion_ars, 2),
            ganancia_perdida_usd=round(ganancia_perdida_usd, 2),
            ganancia_perdida_ars=round(ganancia_perdida_ars, 2)
        )
        result.append(activo_response)
    
    return result

@app.post("/api/activos", response_model=ActivoResponse)
def create_activo(activo: ActivoCreate, db: Session = Depends(get_db)):
    """Create a new investment"""
    db_activo = ActivoDB(
        tipo=activo.tipo,
        ticker=activo.ticker,
        nombre=activo.nombre,
        cantidad=activo.cantidad,
        precio_compra_ars=activo.precio_compra_ars,
        precio_compra_usd=activo.precio_compra_usd,
        fecha_compra=activo.fecha_compra or datetime.now(),
        paridad=activo.paridad,
        tir=activo.tir,
        cotizacion_byma=activo.cotizacion_byma,
        valor_cuotaparte=activo.valor_cuotaparte
    )
    db.add(db_activo)
    db.commit()
    db.refresh(db_activo)
    
    # Get exchange rate and current price
    exchange_rate = get_exchange_rate_value()
    precio_actual = None
    precio_from_yahoo = False
    if db_activo.tipo in ["accion", "cedear"]:
        precio_actual = get_current_price(db_activo.ticker)  # Returns ARS
        if precio_actual:
            precio_from_yahoo = True
    elif db_activo.tipo in ["bono", "on"]:
        precio_actual = db_activo.cotizacion_byma or (db_activo.paridad * 100 if db_activo.paridad else None)  # In USD
    elif db_activo.tipo == "fci":
        precio_actual = db_activo.valor_cuotaparte  # In USD
    
    precio_actual = precio_actual or 0
    
    # Convert to both currencies - all prices in ARS
    if precio_from_yahoo:
        precio_actual_ars = precio_actual
        precio_actual_usd = precio_actual / exchange_rate if exchange_rate else 0
    else:
        # BYMA/bond/FCI prices are in ARS
        precio_actual_ars = precio_actual
        precio_actual_usd = precio_actual / exchange_rate if exchange_rate else 0
    valorizacion_usd = db_activo.cantidad * precio_actual_usd
    valorizacion_ars = db_activo.cantidad * precio_actual_ars
    ganancia_perdida_usd = valorizacion_usd - (db_activo.cantidad * db_activo.precio_compra_usd)
    ganancia_perdida_ars = valorizacion_ars - (db_activo.cantidad * db_activo.precio_compra_ars)
    
    return ActivoResponse(
        id=db_activo.id,
        tipo=db_activo.tipo,
        ticker=db_activo.ticker,
        nombre=db_activo.nombre,
        cantidad=db_activo.cantidad,
        precio_compra_ars=db_activo.precio_compra_ars,
        precio_compra_usd=db_activo.precio_compra_usd,
        fecha_compra=db_activo.fecha_compra,
        paridad=db_activo.paridad,
        tir=db_activo.tir,
        cotizacion_byma=db_activo.cotizacion_byma,
        valor_cuotaparte=db_activo.valor_cuotaparte,
        precio_actual_usd=round(precio_actual_usd, 2),
        precio_actual_ars=round(precio_actual_ars, 2),
        valorizacion_usd=round(valorizacion_usd, 2),
        valorizacion_ars=round(valorizacion_ars, 2),
        ganancia_perdida_usd=round(ganancia_perdida_usd, 2),
        ganancia_perdida_ars=round(ganancia_perdida_ars, 2)
    )

@app.get("/api/portfolio/summary", response_model=PortfolioSummary)
def get_portfolio_summary(db: Session = Depends(get_db)):
    """Get portfolio summary with total invested and current value in ARS and USD"""
    activos = db.query(ActivoDB).all()
    
    # Get exchange rate
    exchange_rate = get_exchange_rate_value()
    
    total_invertido_ars = 0
    total_invertido_usd = 0
    valor_actual_ars = 0
    valor_actual_usd = 0
    
    for activo in activos:
        # Inversion en ARS y USD
        total_invertido_ars += activo.cantidad * activo.precio_compra_ars
        total_invertido_usd += activo.cantidad * activo.precio_compra_usd
        
        # Get current price - all in ARS now
        # For acciones/cedears: Yahoo .BA returns ARS
        # For bonos/ONs/FCI: BYMA prices are in ARS
        precio_actual = None
        if activo.tipo in ["accion", "cedear"]:
            precio_actual = get_current_price(activo.ticker)  # Returns ARS
        elif activo.tipo in ["bono", "on"]:
            # Use BYMA price or paridad * 100 - in ARS
            precio_actual = activo.cotizacion_byma or (activo.paridad * 100 if activo.paridad else None)
            if not precio_actual:
                byma_price = get_byma_price(activo.ticker, activo.tipo)
                precio_actual = byma_price
        elif activo.tipo == "fci":
            precio_actual = activo.valor_cuotaparte  # In ARS
        
        # If no price available, raise error (except for FCI and ON which can have manual entry)
        if precio_actual is None or precio_actual == 0:
            if activo.tipo not in ["fci", "on"]:
                raise HTTPException(status_code=400, detail=f"No se pudo obtener precio para {activo.ticker}")
        
        precio_actual = precio_actual or 0
        
        # All prices are in ARS, convert to USD
        precio_actual_ars = precio_actual
        precio_actual_usd = precio_actual / exchange_rate if exchange_rate else 0
        
        # Valorización en USD y ARS
        valor_actual_usd += activo.cantidad * precio_actual_usd
        valor_actual_ars += activo.cantidad * precio_actual_ars
    
    # Ganancias
    ganancia_perdida_usd = valor_actual_usd - total_invertido_usd
    ganancia_perdida_ars = valor_actual_ars - total_invertido_ars
    
    # Rendimientos
    rendimiento_usd = (ganancia_perdida_usd / total_invertido_usd * 100) if total_invertido_usd > 0 else 0
    rendimiento_ars = (ganancia_perdida_ars / total_invertido_ars * 100) if total_invertido_ars > 0 else 0
    
    return PortfolioSummary(
        total_invertido_ars=round(total_invertido_ars, 2),
        total_invertido_usd=round(total_invertido_usd, 2),
        valor_actual_ars=round(valor_actual_ars, 2),
        valor_actual_usd=round(valor_actual_usd, 2),
        ganancia_perdida_ars=round(ganancia_perdida_ars, 2),
        ganancia_perdida_usd=round(ganancia_perdida_usd, 2),
        rendimiento_porcentaje_ars=round(rendimiento_ars, 2),
        rendimiento_porcentaje_usd=round(rendimiento_usd, 2)
    )

@app.get("/api/portfolio/by-type")
def get_portfolio_by_type(db: Session = Depends(get_db)):
    """Get portfolio distribution by type"""
    activos = db.query(ActivoDB).all()
    exchange_rate = get_exchange_rate_value()
    distribution = {}
    
    for activo in activos:
        tipo = activo.tipo
        precio_actual = 0
        
        if tipo in ["accion", "cedear"]:
            # Yahoo returns ARS
            precio_actual = get_current_price(activo.ticker) or 0
        elif tipo in ["bono", "on"]:
            # BYMA prices are in ARS
            if activo.cotizacion_byma:
                precio_actual = activo.cotizacion_byma
            elif activo.paridad:
                precio_actual = activo.paridad * 100
        elif tipo == "fci":
            precio_actual = activo.valor_cuotaparte or 0
        
        # All prices in ARS, convert to USD for display
        valor = activo.cantidad * (precio_actual / exchange_rate if exchange_rate else 0)
        
        if tipo in distribution:
            distribution[tipo] += valor
        else:
            distribution[tipo] = valor
    
    return [{"tipo": k, "valor": round(v, 2)} for k, v in distribution.items()]


def get_exchange_rate_value():
    """Get USD to ARS exchange rate as float"""
    try:
        response = requests.get("https://open.er-api.com/v6/latest/USD", timeout=10)
        if response.status_code == 200:
            data = response.json()
            return float(data["rates"]["ARS"])
    except Exception as e:
        print(f"Error fetching exchange rate: {e}")
    return 1360.0


@app.get("/api/portfolio/exchange-rate")
def get_exchange_rate():
    """Get USD to ARS exchange rate"""
    try:
        response = requests.get("https://open.er-api.com/v6/latest/USD", timeout=10)
        if response.status_code == 200:
            data = response.json()
            return {"rate": data["rates"]["ARS"], "currency": "ARS"}
    except Exception as e:
        print(f"Error fetching exchange rate: {e}")
    # Fallback to a reasonable default
    return {"rate": 1360.0, "currency": "ARS"}


@app.get("/api/price-lookup")
def lookup_price(ticker: str, tipo: str):
    """Look up current price for a ticker (for form autocomplete)"""
    precio = None
    
    if tipo in ["accion", "cedear"]:
        # Try Yahoo Finance first
        precio = get_current_price(ticker)
        if not precio:
            # Try BYMA as fallback
            precio = get_byma_price(ticker, tipo)
    elif tipo in ["bono", "on"]:
        # Try BYMA first
        precio = get_byma_price(ticker, tipo)
        if not precio:
            # Try Rava
            precio = get_rava_price(ticker, tipo)
    
    return {
        "ticker": ticker.upper(),
        "tipo": tipo,
        "precio": precio
    }


@app.delete("/api/activos/{activo_id}")
def delete_activo(activo_id: int, db: Session = Depends(get_db)):
    """Delete an investment"""
    activo = db.query(ActivoDB).filter(ActivoDB.id == activo_id).first()
    if not activo:
        raise HTTPException(status_code=404, detail="Activo no encontrado")
    
    db.delete(activo)
    db.commit()
    return {"message": "Activo eliminado"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)