import { useState, useEffect } from 'react'
import axios from 'axios'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis } from 'recharts'
import './App.css'

const API_URL = 'http://localhost:8080'

const TIPOS = [
  { value: 'accion', label: 'Acción' },
  { value: 'cedear', label: 'CEDEAR' },
  { value: 'bono', label: 'Bono Soberano' },
  { value: 'on', label: 'Obligación Negociable' },
  { value: 'fci', label: 'Fondo Común de Inversión' }
]

function App() {
  const [activos, setActivos] = useState([])
  const [summary, setSummary] = useState({ total_invertido: 0, valor_actual: 0, ganancia_perdida: 0, rendimiento_porcentaje: 0 })
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
    precio_compra: '',
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

  // Open modal for new investment
  const openAddModal = () => {
    setEditingActivo(null)
    setFormData({
      tipo: 'accion',
      ticker: '',
      nombre: '',
      cantidad: '',
      precio_compra: '',
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
      precio_compra: activo.precio_compra,
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
        precio_compra: parseFloat(formData.precio_compra),
        ...(formData.paridad && { paridad: parseFloat(formData.paridad) }),
        ...(formData.tir && { tir: parseFloat(formData.tir) }),
        ...(formData.cotizacion_byma && { cotizacion_byma: parseFloat(formData.cotizacion_byma) }),
        ...(formData.valor_cuotaparte && { valor_cuotaparte: parseFloat(formData.valor_cuotaparte) })
      }

      if (editingActivo) {
        // Delete and recreate (simplest update approach for MVP)
        await axios.delete(`${API_URL}/activos/${editingActivo.id}`)
      }
      
      await axios.post(`${API_URL}/activos`, payload)
      
      setShowModal(false)
      fetchData()
    } catch (err) {
      alert('Error al guardar: ' + err.message)
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

  const formatCurrency = (value, forceCurrency = null) => {
    const curr = forceCurrency || currency
    if (curr === 'USD') {
      value = value / exchangeRate
    }
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
          <h3>Total Invertido</h3>
          <p className="value">{formatCurrency(summary.total_invertido)}</p>
        </div>
        <div className="card">
          <h3>Valor Actual</h3>
          <p className="value">{formatCurrency(summary.valor_actual)}</p>
        </div>
        <div className="card">
          <h3>Ganancia/Pérdida</h3>
          <p className={`value ${summary.ganancia_perdida >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(summary.ganancia_perdida)}
          </p>
        </div>
        <div className="card">
          <h3>Rendimiento</h3>
          <p className={`value ${summary.rendimiento_porcentaje >= 0 ? 'positive' : 'negative'}`}>
            {summary.rendimiento_porcentaje.toFixed(2)}%
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
                      <td>{formatCurrency(activo.precio_compra)}</td>
                      <td>{activo.precio_actual ? formatCurrency(activo.precio_actual) : '-'}</td>
                      <td>{formatCurrency(activo.valorizacion || 0)}</td>
                      <td className={activo.ganancia_perdida >= 0 ? 'positive' : 'negative'}>
                        {formatCurrency(activo.ganancia_perdida || 0)}
                      </td>
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
                <div className="form-group">
                  <label>Precio de Compra</label>
                  <input type="number" name="precio_compra" value={formData.precio_compra} onChange={handleInputChange} required step="0.01" placeholder="150.50" />
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