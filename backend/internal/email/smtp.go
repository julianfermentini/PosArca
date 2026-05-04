package email

import (
	"context"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
)

type Config struct {
	Host string
	Port int
	User string
	Pass string
}

type Cliente struct {
	cfg Config
}

func NuevoCliente(cfg Config) *Cliente {
	return &Cliente{cfg: cfg}
}

type DatosFactura struct {
	RazonSocial string
	CUIT        string
	Numero      string
	Total       float64
	CAE         string
	PDFPath     string // path local del PDF generado
}

// EnviarFactura envía el PDF de la factura al email del cliente.
func (c *Cliente) EnviarFactura(ctx context.Context, destinatario string, datos DatosFactura) error {
	auth := smtp.PlainAuth("", c.cfg.User, c.cfg.Pass, c.cfg.Host)
	addr := fmt.Sprintf("%s:%d", c.cfg.Host, c.cfg.Port)

	asunto := fmt.Sprintf("Factura electronica %s", datos.Numero)
	cuerpo := buildCuerpo(datos)

	msg := buildMIME(c.cfg.User, destinatario, asunto, cuerpo)

	if err := smtp.SendMail(addr, auth, c.cfg.User, []string{destinatario}, []byte(msg)); err != nil {
		return fmt.Errorf("enviar email: %w", err)
	}

	slog.Info("factura enviada por email", "destinatario", destinatario, "numero", datos.Numero)
	return nil
}

func buildCuerpo(d DatosFactura) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Estimado/a %s,\n\n", d.RazonSocial))
	sb.WriteString("Adjunto encontrara su factura electronica.\n\n")
	sb.WriteString(fmt.Sprintf("Comprobante: %s\n", d.Numero))
	sb.WriteString(fmt.Sprintf("CUIT: %s\n", d.CUIT))
	sb.WriteString(fmt.Sprintf("Total: $%.2f\n", d.Total))
	sb.WriteString(fmt.Sprintf("CAE: %s\n\n", d.CAE))
	sb.WriteString("Gracias por su compra.\n")
	return sb.String()
}

func buildMIME(from, to, subject, body string) string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("From: %s\r\n", from))
	sb.WriteString(fmt.Sprintf("To: %s\r\n", to))
	sb.WriteString(fmt.Sprintf("Subject: %s\r\n", subject))
	sb.WriteString("MIME-Version: 1.0\r\n")
	sb.WriteString("Content-Type: text/plain; charset=UTF-8\r\n")
	sb.WriteString("\r\n")
	sb.WriteString(body)
	return sb.String()
}
