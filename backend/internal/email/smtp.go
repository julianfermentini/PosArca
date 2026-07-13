package email

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type Config struct {
	ResendAPIKey string
	FromName     string
	FromEmail    string
}

type Cliente struct {
	cfg  Config
	http *http.Client
}

func NuevoCliente(cfg Config) *Cliente {
	return &Cliente{
		cfg:  cfg,
		http: &http.Client{Timeout: 15 * time.Second},
	}
}

type DatosFactura struct {
	RazonSocial   string
	CUIT          string
	Numero        string
	Total         float64
	CAE           string
	PDFBytes      []byte
	NegocioNombre string
}

type resendAttachment struct {
	Filename string `json:"filename"`
	Content  string `json:"content"` // base64
}

type resendRequest struct {
	From        string             `json:"from"`
	To          []string           `json:"to"`
	Subject     string             `json:"subject"`
	Text        string             `json:"text"`
	Attachments []resendAttachment `json:"attachments,omitempty"`
}

func (c *Cliente) EnviarFactura(ctx context.Context, destinatario string, datos DatosFactura) error {
	fromName := c.cfg.FromName
	if fromName == "" {
		fromName = "PosArca Fiscal"
	}
	fromEmail := c.cfg.FromEmail
	if fromEmail == "" {
		fromEmail = "onboarding@resend.dev"
	}

	negocio := datos.NegocioNombre
	if negocio == "" {
		negocio = fromName
	}
	asunto := fmt.Sprintf("Factura N° %s — %s", datos.Numero, negocio)

	payload := resendRequest{
		From:    fmt.Sprintf("%s <%s>", fromName, fromEmail),
		To:      []string{destinatario},
		Subject: asunto,
		Text:    buildCuerpo(datos),
	}

	if len(datos.PDFBytes) > 0 {
		nombre := fmt.Sprintf("factura_%s.pdf", strings.ReplaceAll(datos.Numero, "-", "_"))
		payload.Attachments = []resendAttachment{{
			Filename: nombre,
			Content:  base64.StdEncoding.EncodeToString(datos.PDFBytes),
		}}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.resend.com/emails", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("crear request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.cfg.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("enviar email: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		var resBody map[string]any
		json.NewDecoder(resp.Body).Decode(&resBody)
		return fmt.Errorf("resend error %d: %v", resp.StatusCode, resBody)
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
