// Validación de CUIT argentino (algoritmo oficial)
export function validarCUIT(cuit: string): boolean {
  const limpio = cuit.replace(/[-\s]/g, '')
  if (!/^\d{11}$/.test(limpio)) return false

  const multiplicadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const digitos = limpio.split('').map(Number)
  const suma = multiplicadores.reduce((acc, mult, i) => acc + mult * digitos[i], 0)
  const resto = suma % 11
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto

  return verificador === digitos[10]
}

export function formatCUIT(cuit: string): string {
  const limpio = cuit.replace(/\D/g, '')
  if (limpio.length <= 2) return limpio
  if (limpio.length <= 10) return `${limpio.slice(0, 2)}-${limpio.slice(2)}`
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10, 11)}`
}

export function formatPrecio(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(valor)
}

// Genera UUID v4 simple (para IDs locales offline)
export function generarUUID(): string {
  return crypto.randomUUID()
}

// Redondeo a 2 decimales — misma regla que usa el backend para los montos.
export function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

// Dado el precio final con IVA incluido (lo que se tipea en la caja), devuelve
// el neto. Es la única conversión que existe: el IVA nunca se calcula como 21%
// del neto, siempre por resta (final − neto), para que neto + IVA vuelva a dar
// exacto el precio tipeado. Espeja a models.NuevoVentaItem en el backend.
export function calcularNeto(precioFinal: number): number {
  return Math.round((precioFinal / 1.21) * 100) / 100
}

// Extrae el mensaje de error que manda el backend en la respuesta de axios
// ({success: false, error: "..."}), con un fallback para errores de red/CORS
// que nunca llegaron a tener body (ej. servidor caído).
export function extractError(e: unknown, fallback = 'Error desconocido'): string {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}
