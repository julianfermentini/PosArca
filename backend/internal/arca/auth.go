package arca

import (
	"bytes"
	"context"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"go.mozilla.org/pkcs7"
)

const tokenCacheFile = "/app/token_cache.json"

type tokenDisk struct {
	Token      string    `json:"token"`
	Sign       string    `json:"sign"`
	Expiration time.Time `json:"expiration"`
}

func loadTokenFromDisk() {
	data, err := os.ReadFile(tokenCacheFile)
	if err != nil {
		return
	}
	var td tokenDisk
	if err := json.Unmarshal(data, &td); err != nil {
		return
	}
	if time.Now().Before(td.Expiration) {
		cache.token = td.Token
		cache.sign = td.Sign
		cache.expiration = td.Expiration
		slog.Info("token ARCA cargado desde disco", "expira", td.Expiration.Format(time.RFC3339))
	}
}

func saveTokenToDisk(token, sign string, expiration time.Time) {
	td := tokenDisk{Token: token, Sign: sign, Expiration: expiration}
	data, err := json.Marshal(td)
	if err != nil {
		return
	}
	_ = os.WriteFile(tokenCacheFile, data, 0600)
}

const (
	wsaaURLTesting    = "https://wsaahomo.afip.gov.ar/ws/services/LoginCms"
	wsaaURLProduccion = "https://wsaa.afip.gov.ar/ws/services/LoginCms"
)

// tokenCache almacena el token de acceso en memoria (válido 12 horas)
type tokenCache struct {
	mu         sync.Mutex
	token      string
	sign       string
	expiration time.Time
}

var cache = &tokenCache{}

const mockToken = "MOCK_TOKEN"
const mockSign  = "MOCK_SIGN"

// EsMockMode devuelve true si los certs no existen y el entorno es testing.
func EsMockMode(certPath, keyPath, env string) bool {
	if env == "produccion" {
		return false
	}
	_, errCert := os.Stat(certPath)
	_, errKey  := os.Stat(keyPath)
	return os.IsNotExist(errCert) || os.IsNotExist(errKey)
}

// GetToken devuelve el token vigente o renueva si expiró.
func GetToken(ctx context.Context, cuit int64, certPath, keyPath, env string) (token, sign string, err error) {
	if EsMockMode(certPath, keyPath, env) {
		slog.Warn("ARCA mock activo — certs no encontrados, usando datos falsos para testing")
		return mockToken, mockSign, nil
	}

	cache.mu.Lock()
	defer cache.mu.Unlock()

	// Intentar cargar desde disco si la memoria está vacía
	if cache.token == "" {
		loadTokenFromDisk()
	}

	if time.Now().Before(cache.expiration) {
		return cache.token, cache.sign, nil
	}

	slog.Info("renovando token ARCA/AFIP")
	token, sign, err = login(ctx, cuit, certPath, keyPath, env)
	if err != nil {
		return "", "", fmt.Errorf("login AFIP: %w", err)
	}

	exp := time.Now().Add(11 * time.Hour)
	cache.token = token
	cache.sign = sign
	cache.expiration = exp
	saveTokenToDisk(token, sign, exp)

	return token, sign, nil
}

func login(ctx context.Context, cuit int64, certPath, keyPath, env string) (string, string, error) {
	tra, err := buildTRA()
	if err != nil {
		return "", "", fmt.Errorf("build TRA: %w", err)
	}

	cms, err := signTRA(tra, certPath, keyPath)
	if err != nil {
		return "", "", fmt.Errorf("firmar TRA: %w", err)
	}

	resp, err := callWSAA(ctx, cms, env)
	if err != nil {
		return "", "", fmt.Errorf("llamar WSAA: %w", err)
	}

	return resp.Credentials.Token, resp.Credentials.Sign, nil
}

func buildTRA() ([]byte, error) {
	now := time.Now().UTC()
	tra := LoginTicketRequest{
		Header: TRAHeader{
			UniqueID:       fmt.Sprintf("%d", now.Unix()),
			GenerationTime: now.Add(-10 * time.Minute).Format(time.RFC3339),
			ExpirationTime: now.Add(10 * time.Minute).Format(time.RFC3339),
		},
		Service: "wsfe",
	}
	return xml.MarshalIndent(tra, "", "  ")
}

func signTRA(tra []byte, certPath, keyPath string) (string, error) {
	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		return "", fmt.Errorf("leer certificado: %w", err)
	}
	keyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		return "", fmt.Errorf("leer clave privada: %w", err)
	}

	certBlock, _ := pem.Decode(certPEM)
	if certBlock == nil {
		return "", fmt.Errorf("certificado PEM inválido")
	}
	cert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return "", fmt.Errorf("parsear certificado: %w", err)
	}

	keyBlock, _ := pem.Decode(keyPEM)
	if keyBlock == nil {
		return "", fmt.Errorf("clave privada PEM inválida")
	}
	key, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	if err != nil {
		return "", fmt.Errorf("parsear clave privada: %w", err)
	}

	signed, err := pkcs7.NewSignedData(tra)
	if err != nil {
		return "", fmt.Errorf("crear PKCS7: %w", err)
	}
	if err := signed.AddSigner(cert, key, pkcs7.SignerInfoConfig{}); err != nil {
		return "", fmt.Errorf("agregar firmante: %w", err)
	}

	der, err := signed.Finish()
	if err != nil {
		return "", fmt.Errorf("finalizar firma: %w", err)
	}

	return base64.StdEncoding.EncodeToString(der), nil
}

func callWSAA(ctx context.Context, cms, env string) (*TicketAcceso, error) {
	url := wsaaURLTesting
	if env == "produccion" {
		url = wsaaURLProduccion
	}

	soapBody := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wslogin="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Body>
    <wslogin:loginCms>
      <wslogin:in>%s</wslogin:in>
    </wslogin:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`, cms)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBufferString(soapBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")
	req.Header.Set("SOAPAction", "")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP WSAA: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var envelope struct {
		Body struct {
			Response struct {
				Return string `xml:"loginCmsReturn"`
			} `xml:"loginCmsResponse"`
			Fault struct {
				Code   string `xml:"faultcode"`
				String string `xml:"faultstring"`
			} `xml:"Fault"`
		} `xml:"Body"`
	}
	if err := xml.Unmarshal(body, &envelope); err != nil {
		return nil, fmt.Errorf("parsear respuesta WSAA (body: %s): %w", string(body), err)
	}

	if envelope.Body.Fault.Code != "" {
		return nil, fmt.Errorf("SOAP Fault WSAA [%s]: %s", envelope.Body.Fault.Code, envelope.Body.Fault.String)
	}

	if envelope.Body.Response.Return == "" {
		return nil, fmt.Errorf("WSAA retornó respuesta vacía (HTTP %d, body: %s)", resp.StatusCode, string(body))
	}

	var ta TicketAcceso
	if err := xml.Unmarshal([]byte(envelope.Body.Response.Return), &ta); err != nil {
		return nil, fmt.Errorf("parsear TicketAcceso: %w", err)
	}

	return &ta, nil
}
