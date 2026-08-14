package models

import (
	"math"
	"testing"

	"github.com/google/uuid"
)

const tolerancia = 0.0001

func casiIgual(a, b float64) bool { return math.Abs(a-b) < tolerancia }

func TestRedondear(t *testing.T) {
	casos := []struct {
		in, want float64
	}{
		{21.0, 21.00},
		{17.3544, 17.35}, // redondea para abajo
		{17.356, 17.36},  // redondea para arriba
		{0.124, 0.12},
		{0.126, 0.13},
		{0, 0},
	}
	for _, c := range casos {
		if got := redondear(c.in); !casiIgual(got, c.want) {
			t.Errorf("redondear(%v) = %v, esperaba %v", c.in, got, c.want)
		}
	}
}

// Ojo: los tests que mandan PrecioNeto ejercitan el camino LEGACY (ventas
// encoladas offline por una versión anterior). Que sigan pasando sin tocarlos
// es justamente la prueba de que esos payloads dan los mismos montos que antes.
func TestNuevoVentaItem_IVA21(t *testing.T) {
	it := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "Cerveza", PrecioNeto: 100, Cantidad: 1}, 0)
	if !casiIgual(it.IVA, 21.00) {
		t.Errorf("IVA = %v, esperaba 21.00", it.IVA)
	}
	if !casiIgual(it.Total, 121.00) {
		t.Errorf("Total = %v, esperaba 121.00", it.Total)
	}
}

func TestNuevoVentaItem_PrecioFinalIVA21(t *testing.T) {
	it := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "Cerveza", PrecioFinal: 121, Cantidad: 1}, 0)
	if !casiIgual(it.PrecioNeto, 100.00) {
		t.Errorf("PrecioNeto = %v, esperaba 100.00", it.PrecioNeto)
	}
	if !casiIgual(it.IVA, 21.00) {
		t.Errorf("IVA = %v, esperaba 21.00", it.IVA)
	}
	if !casiIgual(it.Total, 121.00) {
		t.Errorf("Total = %v, esperaba 121.00", it.Total)
	}
}

// El bug que motivó todo esto: un ítem de $100 terminaba valiendo $99,99. El
// precio final tipeado tiene que salir intacto, para CUALQUIER precio.
func TestNuevoVentaItem_RespetaElPrecioTipeado(t *testing.T) {
	for centavos := 1; centavos <= 1000000; centavos += 7 {
		final := float64(centavos) / 100
		for _, qty := range []int{1, 2, 3} {
			it := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "x", PrecioFinal: final, Cantidad: qty}, 0)
			esperado := redondear(final * float64(qty))
			if !casiIgual(it.Total, esperado) {
				t.Fatalf("precio %.2f x%d: Total = %.2f, esperaba %.2f", final, qty, it.Total, esperado)
			}
		}
	}
}

// La identidad de la que depende ARCA: ImpNeto + ImpIVA == ImpTotal. Se arma
// como Total - IVA (outbox.go), así que esto tiene que dar exacto por línea.
func TestNuevoVentaItem_IdentidadNetoMasIVA(t *testing.T) {
	for centavos := 1; centavos <= 500000; centavos += 13 {
		final := float64(centavos) / 100
		for _, qty := range []int{1, 2, 5, 12} {
			it := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "x", PrecioFinal: final, Cantidad: qty}, 0)
			if !casiIgual(it.Total-it.IVA, it.PrecioNeto*float64(qty)) {
				t.Fatalf("precio %.2f x%d: Total(%.2f) - IVA(%.2f) = %.2f, pero neto*cant = %.2f",
					final, qty, it.Total, it.IVA, it.Total-it.IVA, it.PrecioNeto*float64(qty))
			}
		}
	}
}

// Regresión de compatibilidad: un payload legacy (sólo precio_neto) tiene que
// producir EXACTAMENTE el mismo VentaItem que producía la versión anterior.
// Una venta encolada offline no puede cambiar de importe al sincronizarse.
func TestNuevoVentaItem_LegacyIgualQueLaVersionAnterior(t *testing.T) {
	// La fórmula vieja, tal cual estaba antes de este cambio.
	viejo := func(neto float64, cant int) (float64, float64, float64) {
		ivaUnit := redondear(neto * 0.21)
		return neto, redondear(ivaUnit * float64(cant)), redondear((neto + ivaUnit) * float64(cant))
	}
	for centavos := 1; centavos <= 500000; centavos += 11 {
		neto := float64(centavos) / 100
		for _, qty := range []int{1, 2, 3, 7} {
			it := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "x", PrecioNeto: neto, Cantidad: qty}, 0)
			wNeto, wIVA, wTotal := viejo(neto, qty)
			if !casiIgual(it.PrecioNeto, wNeto) || !casiIgual(it.IVA, wIVA) || !casiIgual(it.Total, wTotal) {
				t.Fatalf("legacy neto=%.2f x%d: dio (%.2f, %.2f, %.2f), la versión anterior daba (%.2f, %.2f, %.2f)",
					neto, qty, it.PrecioNeto, it.IVA, it.Total, wNeto, wIVA, wTotal)
			}
		}
	}
}

// Durante la transición el frontend manda los dos campos para que el deploy
// pueda salir en cualquier orden. El final tiene que ganar siempre.
func TestNuevoVentaItem_PrecioFinalGanaSobreNeto(t *testing.T) {
	it := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "x", PrecioFinal: 100, PrecioNeto: 82.64, Cantidad: 1}, 0)
	if !casiIgual(it.Total, 100.00) {
		t.Errorf("Total = %v, esperaba 100.00 (el precio final manda)", it.Total)
	}
}

func TestNuevoVentaItem_CantidadCeroOMenosEsUno(t *testing.T) {
	for _, qty := range []int{0, -3} {
		it := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "x", PrecioNeto: 100, Cantidad: qty}, 0)
		if it.Cantidad != 1 {
			t.Errorf("cantidad %d debería normalizarse a 1, dio %d", qty, it.Cantidad)
		}
	}
}

// La garantía fiscal documentada: una línea de N unidades tiene que sumar EXACTO
// lo mismo que N líneas de una unidad. Si el redondeo del IVA se hiciera después
// de multiplicar por la cantidad, esto se rompería por centavos.
func TestNuevoVentaItem_LineaIgualASumaDeUnidades(t *testing.T) {
	finales := []float64{100, 121, 99.99, 40, 150, 8.26, 1.65, 6300, 8500, 35000}
	qtys := []int{2, 3, 5, 7, 12}
	for _, final := range finales {
		for _, qty := range qtys {
			linea := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "x", PrecioFinal: final, Cantidad: qty}, 0)
			unidad := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "x", PrecioFinal: final, Cantidad: 1}, 0)

			sumaIVA := redondear(unidad.IVA * float64(qty))
			sumaTotal := redondear(unidad.Total * float64(qty))

			if !casiIgual(linea.IVA, sumaIVA) {
				t.Errorf("final=%.2f qty=%d: IVA de línea %.2f != suma de unidades %.2f", final, qty, linea.IVA, sumaIVA)
			}
			if !casiIgual(linea.Total, sumaTotal) {
				t.Errorf("final=%.2f qty=%d: Total de línea %.2f != suma de unidades %.2f", final, qty, linea.Total, sumaTotal)
			}
		}
	}
}

func TestTotalesDeItems(t *testing.T) {
	items := []VentaItem{
		NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "a", PrecioNeto: 100, Cantidad: 2}, 0),
		NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "b", PrecioNeto: 82.64, Cantidad: 1}, 1),
		NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "c", PrecioNeto: 33.06, Cantidad: 3}, 2),
	}

	sub, iva, total := TotalesDeItems(items)

	// subtotal = 100*2 + 82.64 + 33.06*3 = 381.82
	if !casiIgual(sub, 381.82) {
		t.Errorf("subtotal = %v, esperaba 381.82", sub)
	}
	// Invariante fiscal: subtotal + IVA tiene que dar el total, al centavo.
	if !casiIgual(sub+iva, total) {
		t.Errorf("subtotal(%.2f) + IVA(%.2f) = %.2f, pero total = %.2f", sub, iva, sub+iva, total)
	}
}

func TestTotalesDeItems_CantidadCeroCuentaComoUno(t *testing.T) {
	// Filas legacy sin cantidad (Cantidad=0) tienen que contarse como 1 unidad.
	items := []VentaItem{{PrecioNeto: 50, Cantidad: 0, IVA: 10.5, Total: 60.5}}
	sub, iva, total := TotalesDeItems(items)
	if !casiIgual(sub, 50) || !casiIgual(iva, 10.5) || !casiIgual(total, 60.5) {
		t.Errorf("legacy cantidad=0: sub=%v iva=%v total=%v, esperaba 50 / 10.5 / 60.5", sub, iva, total)
	}
}
