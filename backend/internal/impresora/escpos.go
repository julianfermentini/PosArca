package impresora

import (
	"bytes"
	"fmt"
	"image"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

// Comandos ESC/POS para impresora térmica Gadnic
var (
	cmdInit         = []byte{0x1B, 0x40}
	cmdCorteParcial = []byte{0x1D, 0x56, 0x01}
	cmdBold         = []byte{0x1B, 0x45, 0x01}
	cmdBoldOff      = []byte{0x1B, 0x45, 0x00}
	cmdCenter       = []byte{0x1B, 0x61, 0x01}
	cmdLeft         = []byte{0x1B, 0x61, 0x00}
	cmdRight        = []byte{0x1B, 0x61, 0x02}
	cmdLineFeed     = []byte{0x0A}
	cmdDoubleHeight = []byte{0x1D, 0x21, 0x01}
	cmdNormalSize   = []byte{0x1D, 0x21, 0x00}
)

const anchoTicket = 32 // caracteres para papel de 58mm

type DatosTicket struct {
	RazonSocial string
	CUIT        string
	PuntoVenta  int
	TipoCmp     string
	Numero      string
	Fecha       time.Time
	Items       []ItemTicket
	Subtotal    float64
	IVA         float64
	Total       float64
	MetodoPago  string
	CAE         string
	CAEVto      time.Time
	QRBase64    string
}

type ItemTicket struct {
	Descripcion string
	PrecioNeto  float64
	Total       float64
}

// GenerarESCPOS arma el buffer listo para enviar a la impresora Gadnic.
func GenerarESCPOS(d DatosTicket) ([]byte, error) {
	var buf bytes.Buffer

	w := func(b []byte) { buf.Write(b) }
	ln := func(s string) { buf.WriteString(s); buf.Write(cmdLineFeed) }
	sep := func() { ln(strings.Repeat("-", anchoTicket)) }

	centerStr := func(s string) string {
		if len(s) >= anchoTicket {
			return s[:anchoTicket]
		}
		pad := (anchoTicket - len(s)) / 2
		return strings.Repeat(" ", pad) + s
	}

	// Encabezado
	w(cmdInit)
	w(cmdCenter)
	w(cmdBold)
	w(cmdDoubleHeight)
	ln(centerStr(d.RazonSocial))
	w(cmdNormalSize)
	w(cmdBoldOff)
	ln(centerStr("CUIT: " + d.CUIT))
	ln(centerStr(d.TipoCmp + " Nro: " + d.Numero))
	ln(centerStr(d.Fecha.Format("02/01/2006 15:04")))

	// Items
	w(cmdLeft)
	sep()
	for _, item := range d.Items {
		desc := item.Descripcion
		if len(desc) > 20 {
			desc = desc[:20]
		}
		precio := fmt.Sprintf("$%.2f", item.Total)
		espacios := anchoTicket - len(desc) - len(precio)
		if espacios < 1 {
			espacios = 1
		}
		ln(desc + strings.Repeat(" ", espacios) + precio)
	}

	// Totales
	sep()
	w(cmdRight)
	ln(fmt.Sprintf("Subtotal neto:   $%.2f", d.Subtotal))
	ln(fmt.Sprintf("IVA 21%%:         $%.2f", d.IVA))
	w(cmdBold)
	ln(fmt.Sprintf("TOTAL:           $%.2f", d.Total))
	w(cmdBoldOff)
	ln("Pago: " + d.MetodoPago)

	// Datos CAE
	w(cmdLeft)
	sep()
	ln("CAE: " + d.CAE)
	ln("Vto: " + d.CAEVto.Format("02/01/2006"))
	sep()

	// QR obligatorio por AFIP — se imprime como imagen raster ESC/POS
	if d.QRBase64 != "" {
		qrURL := "https://www.afip.gob.ar/fe/qr/?p=" + d.QRBase64
		w(cmdCenter)
		if qrBytes, err := renderQRESCPOS(qrURL); err == nil {
			buf.Write(qrBytes)
			buf.Write(cmdLineFeed)
		}
	}

	w(cmdCenter)
	ln(centerStr("Gracias por su compra!"))
	buf.Write(cmdLineFeed)
	buf.Write(cmdLineFeed)
	buf.Write(cmdLineFeed)
	buf.Write(cmdCorteParcial)

	return buf.Bytes(), nil
}

// renderQRESCPOS genera el QR y lo codifica en formato GS v 0 (raster bitmap).
func renderQRESCPOS(content string) ([]byte, error) {
	q, err := qrcode.New(content, qrcode.Medium)
	if err != nil {
		return nil, err
	}

	const size = 200
	img := q.Image(size)
	return imagenAESCPOS(img), nil
}

// imagenAESCPOS convierte una imagen a bytes ESC/POS usando el comando GS v 0.
func imagenAESCPOS(img image.Image) []byte {
	bounds := img.Bounds()
	w := bounds.Max.X - bounds.Min.X
	h := bounds.Max.Y - bounds.Min.Y

	// Ancho en bytes (1 byte = 8 píxeles)
	widthBytes := (w + 7) / 8

	// GS v 0: xL xH yL yH + datos
	xL := byte(widthBytes & 0xFF)
	xH := byte((widthBytes >> 8) & 0xFF)
	yL := byte(h & 0xFF)
	yH := byte((h >> 8) & 0xFF)

	var buf bytes.Buffer
	buf.Write([]byte{0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH})

	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for byteIdx := 0; byteIdx < widthBytes; byteIdx++ {
			var b byte
			for bit := 0; bit < 8; bit++ {
				x := bounds.Min.X + byteIdx*8 + bit
				if x < bounds.Max.X {
					r, g, bv, _ := img.At(x, y).RGBA()
					// Pixel negro → bit en 1
					luminancia := (r + g + bv) / 3
					if luminancia < 0x8000 {
						b |= 1 << uint(7-bit)
					}
				}
			}
			buf.WriteByte(b)
		}
	}

	return buf.Bytes()
}
