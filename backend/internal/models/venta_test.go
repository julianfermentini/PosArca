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

func TestNuevoVentaItem_IVA21(t *testing.T) {
	it := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "Cerveza", PrecioNeto: 100, Cantidad: 1}, 0)
	if !casiIgual(it.IVA, 21.00) {
		t.Errorf("IVA = %v, esperaba 21.00", it.IVA)
	}
	if !casiIgual(it.Total, 121.00) {
		t.Errorf("Total = %v, esperaba 121.00", it.Total)
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
	netos := []float64{82.64, 100, 33.06, 41.32, 123.97, 8.26, 1.65}
	qtys := []int{2, 3, 5, 7, 12}
	for _, neto := range netos {
		for _, qty := range qtys {
			linea := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "x", PrecioNeto: neto, Cantidad: qty}, 0)
			unidad := NuevoVentaItem(uuid.Nil, ItemRequest{Descripcion: "x", PrecioNeto: neto, Cantidad: 1}, 0)

			sumaIVA := redondear(unidad.IVA * float64(qty))
			sumaTotal := redondear(unidad.Total * float64(qty))

			if !casiIgual(linea.IVA, sumaIVA) {
				t.Errorf("neto=%.2f qty=%d: IVA de línea %.2f != suma de unidades %.2f", neto, qty, linea.IVA, sumaIVA)
			}
			if !casiIgual(linea.Total, sumaTotal) {
				t.Errorf("neto=%.2f qty=%d: Total de línea %.2f != suma de unidades %.2f", neto, qty, linea.Total, sumaTotal)
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
