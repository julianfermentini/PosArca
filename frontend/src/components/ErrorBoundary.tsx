import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// ErrorBoundary atrapa cualquier crash de render del árbol de componentes. Sin
// esto, un error en un componente desmonta toda la app y deja la pantalla en
// blanco — inaceptable en una caja en medio de una venta. Acá mostramos un
// mensaje recuperable y dejamos la app reiniciable.
//
// Tiene que ser un class component: React no expone todavía un equivalente en
// hooks para getDerivedStateFromError / componentDidCatch.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log para diagnóstico. El día que sumemos Sentry, el reporte va acá.
    console.error('ErrorBoundary capturó un crash:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F4F6', padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', padding: 32, maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Algo salió mal</h1>
          <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.5 }}>
            Ocurrió un error inesperado. Recargá la página para seguir trabajando; tus ventas guardadas no se pierden.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ width: '100%', height: 46, borderRadius: 12, border: 'none', background: '#3B72E0', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            Recargar
          </button>
          <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 12, fontFamily: 'monospace', wordBreak: 'break-word' }}>
            {this.state.error.message}
          </p>
        </div>
      </div>
    )
  }
}
