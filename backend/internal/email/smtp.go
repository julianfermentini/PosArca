package email

import (
	"context"
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
	"time"
)

type Config struct {
	Host     string
	Port     int
	User     string
	Pass     string
	FromName string
}

type Cliente struct {
	cfg Config
}

func NuevoCliente(cfg Config) *Cliente {
	return &Cliente{cfg: cfg}
}

type DatosFactura struct {
	RazonSocial   string
	CUIT          string
	Numero        string
	Total         float64
	CAE           string
	PDFBytes      []byte // PDF adjunto (nil = sin adjunto)
	NegocioNombre string // nombre del negocio para el asunto
}

// EnviarFactura envía el comprobante al email del cliente con PDF adjunto si está disponible.
func (c *Cliente) EnviarFactura(ctx context.Context, destinatario string, datos DatosFactura) error {
	fromName := c.cfg.FromName
	if fromName == "" {
		fromName = "PosArca Fiscal"
	}
	fromHeader := fmt.Sprintf("%s <%s>", fromName, c.cfg.User)

	negocio := datos.NegocioNombre
	if negocio == "" {
		negocio = fromName
	}
	asunto := fmt.Sprintf("Factura N° %s — %s", datos.Numero, negocio)
	cuerpo := buildCuerpo(datos)

	var msgBytes []byte
	if len(datos.PDFBytes) > 0 {
		pdfFilename := fmt.Sprintf("factura_%s.pdf", strings.ReplaceAll(datos.Numero, "-", "_"))
		msgBytes = buildMIMEWithPDF(fromHeader, destinatario, asunto, cuerpo, datos.PDFBytes, pdfFilename)
	} else {
		msgBytes = []byte(buildMIMESimple(fromHeader, destinatario, asunto, cuerpo))
	}

	auth := smtp.PlainAuth("", c.cfg.User, c.cfg.Pass, c.cfg.Host)
	addr := fmt.Sprintf("%s:%d", c.cfg.Host, c.cfg.Port)

	if err := smtp.SendMail(addr, auth, c.cfg.User, []string{destinatario}, msgBytes); err != nil {
		return fmt.Errorf("enviar email: %w", err)
	}

	slog.Info("factura enviada por email", "destinatario", destinatario, "numero", datos.Numero, "pdf", len(datos.PDFBytes) > 0)
	return nil
}

func buildCuerpo(d DatosFactura) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Estimado/a %s,\n\n", d.RazonSocial))
	sb.WriteString("Le informamos que su factura electronica ha sido generada y autorizada por AFIP/ARCA.\n")
	sb.WriteString("Encontrara el comprobante adjunto en formato PDF.\n\n")
	sb.WriteString("--- DETALLE DEL COMPROBANTE ---\n")
	sb.WriteString(fmt.Sprintf("Numero:      %s\n", d.Numero))
	sb.WriteString(fmt.Sprintf("CUIT:        %s\n", d.CUIT))
	sb.WriteString(fmt.Sprintf("Total:       $%.2f\n", d.Total))
	sb.WriteString(fmt.Sprintf("CAE:         %s\n", d.CAE))
	sb.WriteString("--------------------------------\n\n")
	sb.WriteString("Puede verificar la validez del comprobante en:\n")
	sb.WriteString("https://serviciosweb.afip.gob.ar/genericos/comprobantes/\n\n")
	sb.WriteString("Gracias por su compra.\n")
	return sb.String()
}

func buildMIMESimple(from, to, subject, body string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("From: %s\r\n", from))
	sb.WriteString(fmt.Sprintf("To: %s\r\n", to))
	sb.WriteString(fmt.Sprintf("Date: %s\r\n", time.Now().Format(time.RFC1123Z)))
	sb.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(body)
	return sb.String()
}

func buildMIMEWithPDF(from, to, subject, body string, pdfBytes []byte, pdfFilename string) []byte {
	boundary := fmt.Sprintf("----PosArcaBoundary%d", time.Now().UnixNano())

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("From: %s\r\n", from))
	sb.WriteString(fmt.Sprintf("To: %s\r\n", to))
	sb.WriteString(fmt.Sprintf("Date: %s\r\n", time.Now().Format(time.RFC1123Z)))
	sb.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=\"%s\"\r\n", boundary))
	sb.WriteString("\r\n")

	// Parte de texto
	sb.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	sb.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(body)
	sb.WriteString("\r\n")

	// Parte PDF
	sb.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	sb.WriteString(fmt.Sprintf("Content-Type: application/pdf; name=\"%s\"\r\n", pdfFilename))
	sb.WriteString("Content-Transfer-Encoding: base64\r\n")
	sb.WriteString(fmt.Sprintf("Content-Disposition: attachment; filename=\"%s\"\r\n", pdfFilename))
	sb.WriteString("\r\n")

	encoded := base64.StdEncoding.EncodeToString(pdfBytes)
	for i := 0; i < len(encoded); i += 76 {
		end := i + 76
		if end > len(encoded) {
			end = len(encoded)
		}
		sb.WriteString(encoded[i:end])
		sb.WriteString("\r\n")
	}

	sb.WriteString(fmt.Sprintf("--%s--\r\n", boundary))
	return []byte(sb.String())
}
