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

// El precio que ingresa el usuario ya tiene IVA incluido.
// Estas funciones reciben precio_neto (ya calculado) como siempre.
export function calcularIVA(precioNeto: number): number {
  return Math.round(precioNeto * 0.21 * 100) / 100
}

export function calcularTotal(precioNeto: number): number {
  return Math.round(precioNeto * 1.21 * 100) / 100
}

// Dada la precio final con IVA incluido, devuelve el neto.
export function calcularNeto(precioFinal: number): number {
  return Math.round((precioFinal / 1.21) * 100) / 100
}
