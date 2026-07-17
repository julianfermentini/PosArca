package config

import (
	"log/slog"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL    string // PostgreSQL DSN para GORM (Supabase connection string)
	SupabaseURL    string // URL de la REST API de Supabase
	SupabaseKey    string
	ArcaCUIT       string
	ArcaCertPath   string
	ArcaKeyPath    string
	ArcaEnv        string
	ArcaPuntoVenta int
	ResendAPIKey   string
	ResendFromEmail string
	SMTPFromName   string
	NegocioNombre  string
	NegocioDirec   string
	NegocioTel     string
	NegocioIVACond string
	PrinterPort    string
	PrinterBaud    int
	Port           string
	JWTSecret      string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		slog.Info("sin archivo .env, usando variables de entorno del sistema")
	}

	printerBaud, _ := strconv.Atoi(getEnv("PRINTER_BAUD", "9600"))
	puntoVenta, _ := strconv.Atoi(getEnv("ARCA_PUNTO_VENTA", "1"))

	return &Config{
		DatabaseURL:    mustGetEnv("DATABASE_URL"),
		SupabaseURL:    getEnv("SUPABASE_URL", ""),
		SupabaseKey:    getEnv("SUPABASE_KEY", ""),
		ArcaCUIT:       mustGetEnv("ARCA_CUIT"),
		ArcaCertPath:   mustGetEnv("ARCA_CERT_PATH"),
		ArcaKeyPath:    mustGetEnv("ARCA_KEY_PATH"),
		ArcaEnv:        getEnv("ARCA_ENV", "testing"),
		ArcaPuntoVenta: puntoVenta,
		ResendAPIKey:    getEnv("RESEND_API_KEY", ""),
		ResendFromEmail: getEnv("RESEND_FROM_EMAIL", "onboarding@resend.dev"),
		SMTPFromName:    getEnv("SMTP_FROM_NAME", "PosArca Fiscal"),
		NegocioNombre:  getEnv("NEGOCIO_NOMBRE", "Mi Negocio"),
		NegocioDirec:   getEnv("NEGOCIO_DIRECCION", ""),
		NegocioTel:     getEnv("NEGOCIO_TEL", ""),
		NegocioIVACond: getEnv("NEGOCIO_IVA_COND", "Responsable Inscripto"),
		PrinterPort:    getEnv("PRINTER_PORT", "/dev/ttyUSB0"),
		PrinterBaud:    printerBaud,
		Port:           getEnv("PORT", "8080"),
		JWTSecret:      mustGetEnvFailFast("JWT_SECRET"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Warn("variable de entorno no configurada", "key", key)
	}
	return v
}

// mustGetEnvFailFast aborta el arranque si falta una variable que no admite
// ningún valor por defecto seguro (a diferencia de mustGetEnv, que solo avisa).
func mustGetEnvFailFast(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("variable de entorno obligatoria no configurada, abortando arranque", "key", key)
		os.Exit(1)
	}
	return v
}
