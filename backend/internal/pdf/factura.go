package pdf

import (
	"bytes"
	"fmt"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	"github.com/skip2/go-qrcode"
)

// DatosFacturaPDF agrupa todo lo necesario para generar el PDF.
type DatosFacturaPDF struct {
	// Emisor
	NegocioNombre     string
	NegocioDirec      string
	NegocioTel        string
	NegocioIVACond    string
	CUIT              string
	PuntoVenta        int
	IngBrutos         string
	InicioActividades string

	// Comprobante
	Numero    string // ej: "001-00000007"
	Fecha     time.Time
	TipoComp  string // "Factura A" | "Factura B"
	LetraComp string // "A" | "B"

	// Receptor
	RazonSocial    string
	CUITCliente    string
	EmailCliente   string
	CondIVACliente string // "Responsable Inscripto" | "Consumidor Final"

	// Items
	Items []ItemPDF

	// Totales
	Subtotal float64
	IVA      float64
	Total    float64

	// Pago
	MetodoPago string

	// AFIP
	CAE    string
	CAEVto time.Time
	QRData string // base64 del payload JSON del QR AFIP (RG 4892/2020)

	// Nota de defensa del consumidor — texto libre configurado en Empresa, vacío si no se cargó.
	DefensaConsumidor string
}

type ItemPDF struct {
	Descripcion   string
	PrecioNeto    float64 // neto por unidad
	IVAPorcentaje float64
	Cantidad      int     // 0 vale como 1 (líneas anteriores a la columna cantidad)
	Total         float64 // neto + IVA de la línea completa (unidad × cantidad)
}

// alicuotasAFIP son las alícuotas de IVA que ARCA exige discriminar en una
// Factura A, en el orden en que se muestran. El sistema hoy solo factura al
// 21%, así que el resto siempre da $0 — no es un dato inventado, es correcto
// mostrar en cero las alícuotas que el negocio no usa.
var alicuotasAFIP = []float64{27, 21, 10.5, 5, 2.5, 0}

// grupoItem agrupa líneas de venta idénticas (misma descripción, precio y
// alícuota) en una sola fila con cantidad — igual que hace el ticket ESC/POS
// (printer.ts), en vez de imprimir una fila por unidad.
type grupoItem struct {
	descripcion   string
	precioNeto    float64
	ivaPorcentaje float64
	cantidad      int
	subtotalNeto  float64
	totalConIVA   float64
}

func agruparItems(items []ItemPDF) []grupoItem {
	var grupos []grupoItem
	for _, it := range items {
		cantidad := it.Cantidad
		if cantidad < 1 {
			cantidad = 1
		}
		encontrado := false
		for i := range grupos {
			g := &grupos[i]
			if g.descripcion == it.Descripcion && g.precioNeto == it.PrecioNeto && g.ivaPorcentaje == it.IVAPorcentaje {
				g.cantidad += cantidad
				g.subtotalNeto += it.PrecioNeto * float64(cantidad)
				g.totalConIVA += it.Total
				encontrado = true
				break
			}
		}
		if !encontrado {
			grupos = append(grupos, grupoItem{
				descripcion:   it.Descripcion,
				precioNeto:    it.PrecioNeto,
				ivaPorcentaje: it.IVAPorcentaje,
				cantidad:      cantidad,
				subtotalNeto:  it.PrecioNeto * float64(cantidad),
				totalConIVA:   it.Total,
			})
		}
	}
	return grupos
}

// Generar devuelve los bytes del PDF.
func Generar(d DatosFacturaPDF) ([]byte, error) {
	f := fpdf.New("P", "mm", "A4", "")
	f.SetMargins(10, 10, 10)
	f.SetAutoPageBreak(true, 15)
	f.AddPage()

	tr := f.UnicodeTranslatorFromDescriptor("cp1252")

	const (
		pageW = 190.0 // ancho útil (210 - 20 margen)
		lm    = 10.0  // left margin
	)

	// ── CABECERA ────────────────────────────────────────────────────────────
	// Caja del emisor (izquierda, 55% del ancho)
	emisorW := pageW * 0.55

	f.SetXY(lm, 10)
	f.SetFont("Arial", "B", 14)
	f.CellFormat(emisorW, 7, tr(d.NegocioNombre), "", 1, "L", false, 0, "")

	f.SetFont("Arial", "", 9)
	if d.NegocioDirec != "" {
		f.SetX(lm)
		f.CellFormat(emisorW, 5, tr(d.NegocioDirec), "", 1, "L", false, 0, "")
	}
	if d.NegocioTel != "" {
		f.SetX(lm)
		f.CellFormat(emisorW, 5, tr("Tel: "+d.NegocioTel), "", 1, "L", false, 0, "")
	}
	f.SetX(lm)
	f.CellFormat(emisorW, 5, tr("CUIT: "+formatCUIT(d.CUIT)), "", 1, "L", false, 0, "")
	f.SetX(lm)
	f.CellFormat(emisorW, 5, tr("IVA: "+d.NegocioIVACond), "", 1, "L", false, 0, "")
	if d.IngBrutos != "" {
		f.SetX(lm)
		f.CellFormat(emisorW, 5, tr("Ing. Brutos: "+d.IngBrutos), "", 1, "L", false, 0, "")
	}
	if d.InicioActividades != "" {
		f.SetX(lm)
		f.CellFormat(emisorW, 5, tr("Inicio Act.: "+d.InicioActividades), "", 1, "L", false, 0, "")
	}

	// Caja central: letra del comprobante (cuadro grande)
	boxX := lm + emisorW
	boxW := pageW - emisorW
	f.SetDrawColor(80, 80, 80)
	f.SetLineWidth(0.5)
	f.Rect(boxX, 10, boxW, 22, "D")

	// Letra grande centrada
	f.SetFont("Arial", "B", 28)
	f.SetXY(boxX, 12)
	f.CellFormat(boxW, 10, d.LetraComp, "", 1, "C", false, 0, "")

	f.SetFont("Arial", "", 8)
	f.SetX(boxX)
	f.CellFormat(boxW, 5, "COD. "+tipoComp(d.LetraComp), "", 1, "C", false, 0, "")

	// Info del comprobante (debajo del cuadro de letra)
	f.SetFont("Arial", "", 9)
	f.SetXY(boxX, 34)
	f.CellFormat(boxW, 5, tr(d.TipoComp), "", 1, "C", false, 0, "")
	f.SetX(boxX)
	f.CellFormat(boxW, 5, "N\xba "+d.Numero, "", 1, "C", false, 0, "")
	f.SetX(boxX)
	f.CellFormat(boxW, 5, tr("Fecha: "+d.Fecha.Format("02/01/2006")), "", 1, "C", false, 0, "")

	// Punto de venta
	f.SetX(boxX)
	f.SetFont("Arial", "", 7)
	f.CellFormat(boxW, 4, tr(fmt.Sprintf("Pto. Venta: %04d", d.PuntoVenta)), "", 1, "C", false, 0, "")

	// ORIGINAL
	f.SetX(boxX)
	f.SetFont("Arial", "B", 7)
	f.CellFormat(boxW, 4, "ORIGINAL", "", 1, "C", false, 0, "")

	// Línea separadora
	y := 48.0
	f.SetLineWidth(0.3)
	f.Line(lm, y, lm+pageW, y)

	// ── DATOS DEL RECEPTOR ──────────────────────────────────────────────────
	y += 2
	f.SetFont("Arial", "B", 9)
	f.SetXY(lm, y)
	f.CellFormat(20, 6, tr("Señor/es:"), "", 0, "L", false, 0, "")
	f.SetFont("Arial", "", 9)
	f.CellFormat(pageW-20, 6, tr(d.RazonSocial), "", 1, "L", false, 0, "")

	f.SetX(lm)
	f.SetFont("Arial", "B", 9)
	f.CellFormat(20, 6, "CUIT:", "", 0, "L", false, 0, "")
	f.SetFont("Arial", "", 9)
	f.CellFormat(80, 6, formatCUIT(d.CUITCliente), "", 0, "L", false, 0, "")

	f.SetFont("Arial", "B", 9)
	f.CellFormat(15, 6, "IVA:", "", 0, "L", false, 0, "")
	f.SetFont("Arial", "", 9)
	f.CellFormat(pageW-115, 6, tr(d.CondIVACliente), "", 1, "L", false, 0, "")

	if d.EmailCliente != "" {
		f.SetX(lm)
		f.SetFont("Arial", "B", 9)
		f.CellFormat(20, 6, "Email:", "", 0, "L", false, 0, "")
		f.SetFont("Arial", "", 9)
		f.CellFormat(pageW-20, 6, d.EmailCliente, "", 1, "L", false, 0, "")
	}

	// Condición de venta: el sistema no factura a cuenta corriente — efectivo,
	// tarjeta y billetera son todos cobro inmediato, así que "Contado" siempre
	// es correcto (no es un valor fijo inventado, es un hecho del negocio).
	f.SetX(lm)
	f.SetFont("Arial", "B", 9)
	f.CellFormat(35, 6, tr("Condición de venta:"), "", 0, "L", false, 0, "")
	f.SetFont("Arial", "", 9)
	f.CellFormat(pageW-35, 6, "Contado", "", 1, "L", false, 0, "")

	y = f.GetY() + 2
	f.Line(lm, y, lm+pageW, y)

	// ── TABLA DE ARTÍCULOS ──────────────────────────────────────────────────
	y += 4

	// Columnas oficiales de ARCA para el detalle de una Factura A.
	cols := []float64{12, 50, 15, 18, 22, 15, 22, 14, 22}
	hdrs := []string{"Cód.", "Producto/Servicio", "Cant.", "U.medida", "P.Unit.", "%Bonif", "Subtotal", "Alíc.IVA", "Subt.c/IVA"}

	f.SetFillColor(230, 230, 230)
	f.SetFont("Arial", "B", 8)
	f.SetXY(lm, y)
	for i, w := range cols {
		f.CellFormat(w, 7, tr(hdrs[i]), "1", 0, "C", true, 0, "")
	}
	f.Ln(-1)

	f.SetFont("Arial", "", 8)
	f.SetFillColor(255, 255, 255)
	for i, g := range agruparItems(d.Items) {
		f.SetX(lm)
		f.CellFormat(cols[0], 6, fmt.Sprintf("%02d", i+1), "1", 0, "C", false, 0, "")
		f.CellFormat(cols[1], 6, tr(g.descripcion), "1", 0, "L", false, 0, "")
		f.CellFormat(cols[2], 6, fmt.Sprintf("%d", g.cantidad), "1", 0, "C", false, 0, "")
		f.CellFormat(cols[3], 6, "unidades", "1", 0, "C", false, 0, "")
		f.CellFormat(cols[4], 6, formatNum(g.precioNeto), "1", 0, "R", false, 0, "")
		f.CellFormat(cols[5], 6, "0,00", "1", 0, "C", false, 0, "")
		f.CellFormat(cols[6], 6, formatNum(g.subtotalNeto), "1", 0, "R", false, 0, "")
		f.CellFormat(cols[7], 6, fmt.Sprintf("%s%%", formatPorcentaje(g.ivaPorcentaje)), "1", 0, "C", false, 0, "")
		f.CellFormat(cols[8], 6, formatNum(g.totalConIVA), "1", 0, "R", false, 0, "")
		f.Ln(-1)
	}

	// Forma de pago — no exigido por ARCA en este bloque, pero útil para el
	// cliente; el detalle oficial de impuestos va en el bloque de totales.
	y = f.GetY() + 3
	f.SetXY(lm, y)
	f.SetFont("Arial", "B", 9)
	f.CellFormat(35, 6, "Forma de pago:", "", 0, "L", false, 0, "")
	f.SetFont("Arial", "", 9)
	f.CellFormat(pageW-35, 6, tr(metodoPagoLabel(d.MetodoPago)), "", 1, "L", false, 0, "")

	// ── TOTALES (formato ARCA: desglose de IVA por alícuota) ───────────
	ivaPorAlicuota := map[float64]float64{}
	for _, it := range d.Items {
		cantidad := it.Cantidad
		if cantidad < 1 {
			cantidad = 1
		}
		ivaPorAlicuota[it.IVAPorcentaje] += it.Total - it.PrecioNeto*float64(cantidad)
	}

	y = f.GetY() + 4
	totalLabelW := pageW - 40
	renglon := func(label string, valor float64, negrita bool) {
		f.SetX(lm)
		if negrita {
			f.SetFont("Arial", "B", 9)
		} else {
			f.SetFont("Arial", "", 9)
		}
		f.CellFormat(totalLabelW, 6, tr(label), "", 0, "R", false, 0, "")
		f.CellFormat(40, 6, formatMoney(valor), "", 1, "R", false, 0, "")
	}

	f.SetXY(lm, y)
	renglon("Importe Neto Gravado:", d.Subtotal, false)
	for _, alic := range alicuotasAFIP {
		renglon(fmt.Sprintf("IVA %s%%:", formatPorcentaje(alic)), ivaPorAlicuota[alic], false)
	}
	renglon("Importe Otros Tributos:", 0, false)
	renglon("Importe Total:", d.Total, true)

	// ── RÉGIMEN DE TRANSPARENCIA FISCAL (LEY 27.743) ────────────────────────
	y = f.GetY() + 4
	f.SetXY(lm, y)
	f.SetFont("Arial", "B", 8)
	f.CellFormat(pageW, 5, tr("Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) — IVA Contenido: "+formatMoney(d.IVA)), "T", 1, "L", false, 0, "")

	if d.DefensaConsumidor != "" {
		f.SetX(lm)
		f.SetFont("Arial", "", 7)
		f.CellFormat(pageW, 4, tr(d.DefensaConsumidor), "", 1, "L", false, 0, "")
	}

	// ── CAE ─────────────────────────────────────────────────────────────────
	y = f.GetY() + 6
	f.Line(lm, y, lm+pageW, y)
	y += 3

	// QR AFIP (RG 4892/2020): https://www.afip.gov.ar/fe/qr/?p=BASE64_JSON
	qrURL := "https://www.afip.gov.ar/fe/qr/?p=" + d.QRData
	qrBytes, err := qrcode.Encode(qrURL, qrcode.Medium, 256)
	if err == nil {
		f.RegisterImageOptionsReader("qr_afip", fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(qrBytes))
		f.ImageOptions("qr_afip", lm, y, 28, 28, false, fpdf.ImageOptions{}, 0, "")
	}

	// Texto CAE al lado del QR
	textX := lm + 32
	f.SetXY(textX, y+2)
	f.SetFont("Arial", "B", 8)
	f.CellFormat(pageW-32, 5, "Comprobante Autorizado por AFIP", "", 1, "L", false, 0, "")

	f.SetX(textX)
	f.SetFont("Arial", "", 8)
	f.CellFormat(30, 5, "CAE:", "", 0, "L", false, 0, "")
	f.SetFont("Arial", "B", 8)
	f.CellFormat(pageW-62, 5, d.CAE, "", 1, "L", false, 0, "")

	f.SetX(textX)
	f.SetFont("Arial", "", 8)
	f.CellFormat(30, 5, tr("Vto. CAE:"), "", 0, "L", false, 0, "")
	f.SetFont("Arial", "B", 8)
	f.CellFormat(pageW-62, 5, d.CAEVto.Format("02/01/2006"), "", 1, "L", false, 0, "")

	f.SetX(textX)
	f.SetFont("Arial", "", 7)
	f.CellFormat(pageW-32, 4, "Verifique este comprobante en: www.afip.gov.ar/fe/qr", "", 1, "L", false, 0, "")

	var buf bytes.Buffer
	if err := f.Output(&buf); err != nil {
		return nil, fmt.Errorf("generar pdf: %w", err)
	}
	return buf.Bytes(), nil
}

func formatMoney(v float64) string {
	return fmt.Sprintf("$%s", formatNum(v))
}

func formatNum(v float64) string {
	s := fmt.Sprintf("%.2f", v)
	// Separador de miles
	parts := strings.SplitN(s, ".", 2)
	intPart := parts[0]
	neg := strings.HasPrefix(intPart, "-")
	if neg {
		intPart = intPart[1:]
	}
	var result []byte
	for i, c := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			result = append(result, '.')
		}
		result = append(result, byte(c))
	}
	out := string(result) + "," + parts[1]
	if neg {
		out = "-" + out
	}
	return out
}

// formatPorcentaje muestra "21" en vez de "21.00" pero conserva "10.5" para
// la alícuota reducida (10.5%, que no es entera).
func formatPorcentaje(v float64) string {
	if v == float64(int64(v)) {
		return fmt.Sprintf("%d", int64(v))
	}
	return strings.Replace(fmt.Sprintf("%g", v), ".", ",", 1)
}

func formatCUIT(cuit string) string {
	clean := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, cuit)
	if len(clean) == 11 {
		return clean[:2] + "-" + clean[2:10] + "-" + clean[10:]
	}
	return cuit
}

// tipoComp devuelve el código de comprobante AFIP con el cero relleno oficial
// (ej. "01" para Factura A, "06" para Factura B).
func tipoComp(letra string) string {
	switch letra {
	case "A":
		return "01"
	case "B":
		return "06"
	default:
		return "06"
	}
}

func metodoPagoLabel(m string) string {
	switch strings.ToUpper(m) {
	case "EFECTIVO":
		return "Efectivo"
	case "TARJETA":
		return "Tarjeta"
	case "BILLETERA":
		return "Billetera Digital"
	default:
		return m
	}
}
