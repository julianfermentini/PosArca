package config

import (
	"log/slog"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL     string // PostgreSQL DSN para GORM
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
	AlertEmail      string // destino de alertas de operación (CAE trabado); vacío = sin alertas
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		slog.Info("sin archivo .env, usando variables de entorno del sistema")
	}

	return &Config{
		DatabaseURL:     mustGetEnv("DATABASE_URL"),
		ResendAPIKey:    getEnv("RESEND_API_KEY", ""),
		ResendFromEmail: getEnv("RESEND_FROM_EMAIL", "onboarding@resend.dev"),
		SMTPFromName:    getEnv("SMTP_FROM_NAME", "posArg Fiscal"),
		NegocioNombre:   getEnv("NEGOCIO_NOMBRE", "Mi Negocio"),
		NegocioDirec:    getEnv("NEGOCIO_DIRECCION", ""),
		NegocioTel:      getEnv("NEGOCIO_TEL", ""),
		NegocioIVACond:  getEnv("NEGOCIO_IVA_COND", "Responsable Inscripto"),
		Port:            getEnv("PORT", "8080"),
		JWTSecret:       mustGetEnvFailFast("JWT_SECRET"),
		CORSOrigins:     parseOrigins(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")),
		InviteCode:      getEnv("INVITE_CODE", ""),
		AdminSecret:     getEnv("ADMIN_SECRET", ""),
		AlertEmail:      getEnv("ALERT_EMAIL", ""),
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
