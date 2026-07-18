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
}

type ItemPDF struct {
	Descripcion  string
	PrecioNeto   float64
	IVAPorcentaje float64
	Total        float64
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
	f.CellFormat(boxW, 5, tr("Cod. "+tipoComp(d.LetraComp)), "", 1, "C", false, 0, "")

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
	f.CellFormat(20, 6, tr("Se\xf1or/es:"), "", 0, "L", false, 0, "")
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

	y = f.GetY() + 2
	f.Line(lm, y, lm+pageW, y)

	// ── TABLA DE ARTÍCULOS ──────────────────────────────────────────────────
	y += 4

	// Columnas: Cant(15) | Descripción(95) | P.Unit(30) | %IVA(15) | Total(35)
	cols := []float64{15, 95, 30, 15, 35}
	hdrs := []string{"Cant.", "Descripci\xf3n", "Precio Unit.", "%IVA", "TOTAL"}

	f.SetFillColor(230, 230, 230)
	f.SetFont("Arial", "B", 9)
	f.SetXY(lm, y)
	for i, w := range cols {
		f.CellFormat(w, 7, hdrs[i], "1", 0, "C", true, 0, "")
	}
	f.Ln(-1)

	f.SetFont("Arial", "", 9)
	f.SetFillColor(255, 255, 255)
	for _, item := range d.Items {
		f.SetX(lm)
		f.CellFormat(cols[0], 6, "1", "1", 0, "C", false, 0, "")
		f.CellFormat(cols[1], 6, tr(item.Descripcion), "1", 0, "L", false, 0, "")
		f.CellFormat(cols[2], 6, formatMoney(item.PrecioNeto), "1", 0, "R", false, 0, "")
		f.CellFormat(cols[3], 6, fmt.Sprintf("%.0f", item.IVAPorcentaje), "1", 0, "C", false, 0, "")
		f.CellFormat(cols[4], 6, formatMoney(item.Total), "1", 0, "R", false, 0, "")
		f.Ln(-1)
	}

	// Fila subtotal
	f.SetFont("Arial", "B", 9)
	f.SetX(lm)
	subtotalLabelW := cols[0] + cols[1] + cols[2] + cols[3]
	f.CellFormat(subtotalLabelW, 6, "SUBTOTAL", "1", 0, "R", false, 0, "")
	f.CellFormat(cols[4], 6, formatMoney(d.Subtotal+d.IVA), "1", 0, "R", false, 0, "")
	f.Ln(-1)

	// ── PAGO ────────────────────────────────────────────────────────────────
	y = f.GetY() + 4
	f.SetXY(lm, y)
	f.SetFont("Arial", "B", 9)
	f.CellFormat(pageW, 6, "Pagos", "B", 1, "L", false, 0, "")

	f.SetX(lm)
	f.SetFont("Arial", "B", 9)
	f.CellFormat(pageW-35, 6, tr("Medio de Pago"), "1", 0, "L", false, 0, "")
	f.CellFormat(35, 6, "Monto", "1", 0, "R", false, 0, "")
	f.Ln(-1)

	f.SetX(lm)
	f.SetFont("Arial", "", 9)
	f.CellFormat(pageW-35, 6, tr(metodoPagoLabel(d.MetodoPago)), "1", 0, "L", false, 0, "")
	f.CellFormat(35, 6, formatMoney(d.Total), "1", 0, "R", false, 0, "")
	f.Ln(-1)

	f.SetX(lm)
	f.SetFont("Arial", "B", 9)
	f.CellFormat(pageW-35, 6, "TOTAL", "1", 0, "R", false, 0, "")
	f.CellFormat(35, 6, formatMoney(d.Total), "1", 0, "R", false, 0, "")
	f.Ln(-1)

	// ── RÉGIMEN DE TRANSPARENCIA FISCAL (LEY 27.743) ────────────────────────
	y = f.GetY() + 4
	f.SetXY(lm, y)
	f.SetFont("Arial", "B", 9)
	f.CellFormat(pageW, 6, tr("R\xe9gimen de Transparencia Fiscal al Consumidor (LEY 27.743)"), "B", 1, "L", false, 0, "")

	f.SetX(lm)
	f.SetFont("Arial", "", 9)
	f.CellFormat(pageW-35, 6, "IVA Contenido", "0", 0, "L", false, 0, "")
	f.SetFont("Arial", "B", 9)
	f.CellFormat(35, 6, formatMoney(d.IVA), "0", 0, "R", false, 0, "")
	f.Ln(-1)

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

func tipoComp(letra string) string {
	switch letra {
	case "A":
		return "1"
	case "B":
		return "6"
	default:
		return "6"
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
