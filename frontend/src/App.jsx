import { useState, useEffect } from 'react'
import axios from 'axios'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis } from 'recharts'
import './App.css'

const API_URL = 'http://localhost:8080/api'

const TIPOS = [
  { value: 'accion', label: 'Acción' },
  { value: 'cedear', label: 'CEDEAR' },
  { value: 'bono', label: 'Bono Soberano' },
  { value: 'on', label: 'Obligación Negociable' },
  { value: 'fci', label: 'Fondo Común de Inversión' }
]

function App() {
  const [activos, setActivos] = useState([])
  const [summary, setSummary] = useState({ 
    total_invertido_ars: 0, 
    total_invertido_usd: 0,
    valor_actual_ars: 0, 
    valor_actual_usd: 0,
    ganancia_perdida_ars: 0,
    ganancia_perdida_usd: 0,
    rendimiento_porcentaje_ars: 0,
    rendimiento_porcentaje_usd: 0
  })
  const [distribution, setDistribution] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingActivo, setEditingActivo] = useState(null)
  const [formData, setFormData] = useState({
    tipo: 'accion',
    ticker: '',
    nombre: '',
    cantidad: '',
    precio_compra_ars: '',
    precio_compra_usd: '',
    paridad: '',
    tir: '',
    cotizacion_byma: '',
    valor_cuotaparte: ''
  })
  const [submitting, setSubmitting] = useState(false)
  
  // Currency state
  const [currency, setCurrency] = useState('ARS') // 'ARS' or 'USD'
  const [exchangeRate, setExchangeRate] = useState(1360.0)
  const [totalValue, setTotalValue] = useState(0)
  const [darkMode, setDarkMode] = useState(false)

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Fetch exchange rate first
      const rateRes = await axios.get(`${API_URL}/portfolio/exchange-rate`)
      setExchangeRate(rateRes.data.rate || 1360.0)
      const [activosRes, summaryRes, distRes] = await Promise.all([
        axios.get(`${API_URL}/activos`),
        axios.get(`${API_URL}/portfolio/summary`),
        axios.get(`${API_URL}/portfolio/by-type`)
      ])
      setActivos(activosRes.data)
      setSummary(summaryRes.data)
      setDistribution(distRes.data)
      setError(null)
      setTotalValue(distRes.data.reduce((a, b) => a + b.valor, 0))
    } catch (err) {
      setError('Error al cargar datos: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }
  
  // Fetch price and name from backend when ticker/tipo changes
  const fetchPriceFromBackend = async (ticker, tipo) => {
    if (!ticker || !tipo || ticker.length < 2) return
    
    try {
      // Fetch price and exchange rate in parallel
      const [priceRes, rateRes, activoRes] = await Promise.all([
        axios.get(`${API_URL}/price-lookup`, { params: { ticker: ticker.toUpperCase(), tipo } }),
        axios.get(`${API_URL}/portfolio/exchange-rate`),
        axios.get(`${API_URL}/activos`)
      ])
      
      const exchangeRate = rateRes.data.rate || 1360
      const existing = activoRes.data.find(a => a.ticker.toUpperCase() === ticker.toUpperCase() && a.tipo === tipo)
      
      const precioARS = priceRes.data.precio
      const precioUSD = precioARS ? (precioARS / exchangeRate).toFixed(2) : ''
      
      // Always update price and name
      setFormData(prev => ({
        ...prev,
        precio_compra_ars: precioARS ? precioARS.toFixed(2) : prev.precio_compra_ars,
        precio_compra_usd: precioUSD || prev.precio_compra_usd,
        nombre: (existing?.nombre) || (ticker.length >= 3 ? ticker.toUpperCase() : prev.nombre) || prev.nombre
      }))
    } catch (err) {
      console.log('Price lookup failed:', err.message)
    }
  }
  
  // Fetch price when ticker or tipo changes in form (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.ticker && formData.tipo && formData.ticker.length >= 2) {
        fetchPriceFromBackend(formData.ticker, formData.tipo)
      }
    }, 500) // Debounce 500ms
    return () => clearTimeout(timer)
  }, [formData.ticker, formData.tipo])

  // Open modal for new investment
  const openAddModal = () => {
    setEditingActivo(null)
    setFormData({
      tipo: 'accion',
      ticker: '',
      nombre: '',
      cantidad: '',
      precio_compra_ars: '',
      precio_compra_usd: '',
      paridad: '',
      tir: '',
      cotizacion_byma: '',
      valor_cuotaparte: ''
    })
    setShowModal(true)
  }

  // Open modal for editing
  const openEditModal = (activo) => {
    setEditingActivo(activo)
    setFormData({
      tipo: activo.tipo,
      ticker: activo.ticker,
      nombre: activo.nombre,
      cantidad: activo.cantidad,
      precio_compra_ars: activo.precio_compra_ars,
      precio_compra_usd: activo.precio_compra_usd,
      paridad: activo.paridad || '',
      tir: activo.tir || '',
      cotizacion_byma: activo.cotizacion_byma || '',
      valor_cuotaparte: activo.valor_cuotaparte || ''
    })
    setShowModal(true)
  }

  // Submit form (create or update)
  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    
    try {
      const payload = {
        tipo: formData.tipo,
        ticker: formData.ticker.toUpperCase(),
        nombre: formData.nombre,
        cantidad: parseFloat(formData.cantidad),
        precio_compra_ars: parseFloat(formData.precio_compra_ars),
        precio_compra_usd: parseFloat(formData.precio_compra_usd),
        ...(formData.paridad && { paridad: parseFloat(formData.paridad) }),
        ...(formData.tir && { tir: parseFloat(formData.tir) }),
        ...(formData.cotizacion_byma && { cotizacion_byma: parseFloat(formData.cotizacion_byma) }),
        ...(formData.valor_cuotaparte && { valor_cuotaparte: parseFloat(formData.valor_cuotaparte) })
      }

      if (editingActivo) {
        try {
          await axios.delete(`${API_URL}/activos/${editingActivo.id}`)
        } catch (err) {
          console.error('Delete error:', err)
        }
      }
      
      await axios.post(`${API_URL}/activos`, payload)
      
      setShowModal(false)
      fetchData()
    } catch (err) {
      console.error('Error saving:', err.response?.data || err.message)
      alert('Error al guardar: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSubmitting(false)
    }
  }

  // Delete investment
  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta inversión?')) return
    
    try {
      await axios.delete(`${API_URL}/activos/${id}`)
      fetchData()
    } catch (err) {
      alert('Error al eliminar: ' + err.message)
    }
  }

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8']

  const formatCurrency = (value, forceCurrency = null, skipConversion = false) => {
    const curr = forceCurrency || currency
    // Skip conversion for pre-calculated USD values or when forceCurrency is USD and value is already in USD
    if (!skipConversion && curr === 'USD' && value > 100) {
      // Values > 100 are likely ARS (like stock prices), need conversion
      value = value / exchangeRate
    }
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: curr }).format(value)
  }
  
  // Format a value that's already in the target currency (no conversion)
  const formatDirect = (value, curr) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: curr }).format(value)
  }

  const getTipoLabel = (tipo) => {
    const labels = {
      accion: 'Acción',
      cedear: 'CEDEAR',
      bono: 'Bono',
      on: 'Obligación Negociable',
      fci: 'Fondo Común de Inversión'
    }
    return labels[tipo] || tipo
  }

  // Get additional fields based on type
  const getAdditionalFields = () => {
    const tipo = formData.tipo
    if (tipo === 'bono' || tipo === 'on') {
      return (
        <>
          <div className="form-group">
            <label>Paridad</label>
            <input type="number" name="paridad" value={formData.paridad} onChange={handleInputChange} step="0.01" placeholder="1.05" />
          </div>
          <div className="form-group">
            <label>TIR (%)</label>
            <input type="number" name="tir" value={formData.tir} onChange={handleInputChange} step="0.01" placeholder="5.2" />
          </div>
          <div className="form-group">
            <label>Cotización BYMA</label>
            <input type="number" name="cotizacion_byma" value={formData.cotizacion_byma} onChange={handleInputChange} step="0.01" placeholder="105.50" />
          </div>
        </>
      )
    }
    if (tipo === 'fci') {
      return (
        <div className="form-group">
          <label>Valor Cuotaparte</label>
          <input type="number" name="valor_cuotaparte" value={formData.valor_cuotaparte} onChange={handleInputChange} step="0.01" placeholder="10.50" />
        </div>
      )
    }
    return null
  }

  if (loading) return <div className="loading">Cargando portfolio...</div>
  if (error) return <div className="error">{error}</div>

  return (
    <div className={`app ${darkMode ? 'dark' : ''}`}>
      <header className="header">
        <div className="header-content">
          <div>
            <h1>📈 Portfolio Argentino</h1>
            <p>Seguimiento de inversiones en el mercado local</p>
          </div>
          <div className="header-actions">
            <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? '☀️' : '🌙'}
            </button>
            <div className="currency-toggle">
              <span className={currency === 'ARS' ? 'active' : ''} onClick={() => setCurrency('ARS')}>ARS</span>
              <span className={currency === 'USD' ? 'active' : ''} onClick={() => setCurrency('USD')}>USD</span>
            </div>
            <button className="btn btn-primary" onClick={openAddModal}>+ Nueva Inversión</button>
          </div>
        </div>
      </header>

      <div className="summary-cards">
        <div className="card">
          <h3>Total Invertido ({currency})</h3>
          <p className="value">{formatCurrency(currency === 'ARS' ? summary.total_invertido_ars : summary.total_invertido_usd)}</p>
        </div>
        <div className="card">
          <h3>Valor Actual ({currency})</h3>
          <p className="value">{formatCurrency(currency === 'ARS' ? summary.valor_actual_ars : summary.valor_actual_usd)}</p>
        </div>
        <div className="card">
          <h3>Ganancia/Pérdida ({currency})</h3>
          <p className={`value ${(currency === 'ARS' ? summary.ganancia_perdida_ars : summary.ganancia_perdida_usd) >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(currency === 'ARS' ? summary.ganancia_perdida_ars : summary.ganancia_perdida_usd)}
          </p>
        </div>
        <div className="card">
          <h3>Rendimiento (%)</h3>
          <p className={`value ${(currency === 'ARS' ? summary.rendimiento_porcentaje_ars : summary.rendimiento_porcentaje_usd) >= 0 ? 'positive' : 'negative'}`}>
            {(currency === 'ARS' ? summary.rendimiento_porcentaje_ars : summary.rendimiento_porcentaje_usd).toFixed(2)}%
          </p>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="chart-section">
          <h2>Distribución del Portfolio</h2>
          {distribution.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={distribution} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <XAxis type="number" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="tipo" tickFormatter={(v) => getTipoLabel(v)} width={100} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Bar dataKey="valor">
                    {distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                {distribution.map((entry, index) => (
                  <div key={entry.tipo} className="legend-item">
                    <span className="legend-color" style={{ background: COLORS[index % COLORS.length] }}></span>
                    <span className="legend-label">{getTipoLabel(entry.tipo)}</span>
                    <span className="legend-value">{((entry.valor / totalValue) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="no-data">No hay activos para mostrar</p>
          )}
        </div>

        <div className="table-section">
          <h2>Posiciones</h2>
          {activos.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Ticker</th>
                    <th>Nombre</th>
                    <th>Cantidad</th>
                    <th>Precio Compra</th>
                    <th>Precio Actual</th>
                    <th>Valorización</th>
                    <th>G/P</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {activos.map((activo) => (
                    <tr key={activo.id}>
                      <td><span className={`badge badge-${activo.tipo}`}>{getTipoLabel(activo.tipo)}</span></td>
                      <td>{activo.ticker}</td>
                      <td>{activo.nombre}</td>
                      <td>{activo.cantidad.toFixed(2)}</td>
                      {currency === 'ARS' ? (
                        <>
                          <td>{formatDirect(activo.precio_compra_ars, 'ARS')}</td>
                          <td>{activo.precio_actual_ars ? formatDirect(activo.precio_actual_ars, 'ARS') : '-'}</td>
                          <td>{formatDirect(activo.valorizacion_ars || 0, 'ARS')}</td>
                          <td className={activo.ganancia_perdida_ars >= 0 ? 'positive' : 'negative'}>
                            {formatDirect(activo.ganancia_perdida_ars || 0, 'ARS')}
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{formatDirect(activo.precio_compra_usd, 'USD')}</td>
                          <td>{activo.precio_actual_usd ? formatDirect(activo.precio_actual_usd, 'USD') : '-'}</td>
                          <td>{formatDirect(activo.valorizacion_usd || 0, 'USD')}</td>
                          <td className={activo.ganancia_perdida_usd >= 0 ? 'positive' : 'negative'}>
                            {formatDirect(activo.ganancia_perdida_usd || 0, 'USD')}
                          </td>
                        </>
                      )}
                      <td>
                        <div className="action-buttons">
                          <button className="btn btn-small" onClick={() => openEditModal(activo)}>✏️</button>
                          <button className="btn btn-small btn-danger" onClick={() => handleDelete(activo.id)}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="no-data">No hay activos en el portfolio</p>
          )}
        </div>
      </div>

      {/* Modal for Add/Edit Investment */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>{editingActivo ? 'Editar Inversión' : 'Nueva Inversión'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tipo de Activo</label>
                <select name="tipo" value={formData.tipo} onChange={handleInputChange} required>
                  {TIPOS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Ticker</label>
                  <input type="text" name="ticker" value={formData.ticker} onChange={handleInputChange} required placeholder="GGAL" />
                </div>
                <div className="form-group">
                  <label>Nombre</label>
                  <input type="text" name="nombre" value={formData.nombre} onChange={handleInputChange} required placeholder="Banco Galicia" />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Cantidad</label>
                  <input type="number" name="cantidad" value={formData.cantidad} onChange={handleInputChange} required step="0.01" placeholder="100" />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Precio de Compra (ARS)</label>
                  <input type="number" name="precio_compra_ars" value={formData.precio_compra_ars} onChange={handleInputChange} required step="0.01" placeholder="150000" />
                </div>
                <div className="form-group">
                  <label>Precio de Compra (USD)</label>
                  <input type="number" name="precio_compra_usd" value={formData.precio_compra_usd} onChange={handleInputChange} required step="0.01" placeholder="150.50" />
                </div>
              </div>
              
              {getAdditionalFields()}
              
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={submitting}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App