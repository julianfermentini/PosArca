package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL     string // PostgreSQL DSN para GORM
	SupabaseURL     string
	SupabaseKey     string
	ArcaCUIT        string // solo para migración inicial; multi-tenant usa DB
	ArcaCertContent string // PEM del certificado; se seedea en DB al arrancar
	ArcaKeyContent  string // PEM de la clave privada; se seedea en DB al arrancar
	ArcaEnv         string
	ArcaPuntoVenta  int
	ResendAPIKey    string
	ResendFromEmail string
	SMTPFromName    string
	NegocioNombre   string
	NegocioDirec    string
	NegocioTel      string
	NegocioIVACond  string
	Port            string
	JWTSecret       string
	CORSOrigins     []string
	InviteCode      string // requerido para nuevos registros; vacío = modo legacy (1 sola cuenta)
	AdminSecret     string // si está seteado, habilita POST /admin/crear-cuenta
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		slog.Info("sin archivo .env, usando variables de entorno del sistema")
	}

	puntoVenta, _ := strconv.Atoi(getEnv("ARCA_PUNTO_VENTA", "1"))

	// Soporta tanto el PEM directo (ARCA_CERT_CONTENT) como el archivo
	// (ARCA_CERT_PATH + ARCA_CERT_CONTENT escrito por Railway en startup legacy).
	certContent := getEnv("ARCA_CERT_CONTENT", "")
	keyContent  := getEnv("ARCA_KEY_CONTENT", "")

	return &Config{
		DatabaseURL:     mustGetEnv("DATABASE_URL"),
		SupabaseURL:     getEnv("SUPABASE_URL", ""),
		SupabaseKey:     getEnv("SUPABASE_KEY", ""),
		ArcaCUIT:        getEnv("ARCA_CUIT", ""),
		ArcaCertContent: certContent,
		ArcaKeyContent:  keyContent,
		ArcaEnv:         getEnv("ARCA_ENV", "testing"),
		ArcaPuntoVenta:  puntoVenta,
		ResendAPIKey:    getEnv("RESEND_API_KEY", ""),
		ResendFromEmail: getEnv("RESEND_FROM_EMAIL", "onboarding@resend.dev"),
		SMTPFromName:    getEnv("SMTP_FROM_NAME", "PosArca Fiscal"),
		NegocioNombre:  getEnv("NEGOCIO_NOMBRE", "Mi Negocio"),
		NegocioDirec:   getEnv("NEGOCIO_DIRECCION", ""),
		NegocioTel:     getEnv("NEGOCIO_TEL", ""),
		NegocioIVACond: getEnv("NEGOCIO_IVA_COND", "Responsable Inscripto"),
		Port:           getEnv("PORT", "8080"),
		JWTSecret:      mustGetEnvFailFast("JWT_SECRET"),
		CORSOrigins:    parseOrigins(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),
		InviteCode:     getEnv("INVITE_CODE", ""),
		AdminSecret:    getEnv("ADMIN_SECRET", ""),
	}
}

func parseOrigins(raw string) []string {
	var origins []string
	for _, o := range strings.Split(raw, ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}
	return origins
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

func mustGetEnvFailFast(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("variable de entorno obligatoria no configurada, abortando arranque", "key", key)
		os.Exit(1)
	}
	return v
}
