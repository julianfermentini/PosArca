package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"pos-fiscal/config"
	"pos-fiscal/internal/api"
	"pos-fiscal/internal/db"
	"pos-fiscal/internal/email"
	"pos-fiscal/internal/handlers"
	"pos-fiscal/internal/models"

	"gorm.io/gorm"
)

func main() {
	cfg := config.Load()

	database, err := db.Connect(cfg)
	if err != nil {
		slog.Error("no se pudo conectar a la base de datos", "err", err)
		os.Exit(1)
	}

	// Seedear certs/clave ARCA en la única empresa existente desde env vars.
	// Esto soporta el setup legacy (Railway con ARCA_CERT_CONTENT/ARCA_KEY_CONTENT)
	// y el primer arranque de una empresa nueva con certs en env vars.
	seedearCertsARCA(database, cfg)

	emailCli := email.NuevoCliente(email.Config{
		ResendAPIKey: cfg.ResendAPIKey,
		FromEmail:    cfg.ResendFromEmail,
		FromName:     cfg.SMTPFromName,
	})

	workerCtx, cancelWorker := context.WithCancel(context.Background())
	defer cancelWorker()
	worker := handlers.NuevoWorker(database, emailCli)
	go worker.Iniciar(workerCtx, 5*time.Second)

	router := api.SetupRouter(database, cfg, worker)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		slog.Info("servidor POS iniciado", "port", cfg.Port, "arca_env", cfg.ArcaEnv)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("error servidor", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("apagando servidor...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}

// seedearCertsARCA copia el contenido de ARCA_CERT_CONTENT / ARCA_KEY_CONTENT en
// la primera empresa de la base de datos, si ambas env vars están seteadas y la
// empresa aún no tiene certs guardados. Idempotente: si ya tienen contenido, no los pisa.
func seedearCertsARCA(database *gorm.DB, cfg *config.Config) {
	if cfg.ArcaCertContent == "" || cfg.ArcaKeyContent == "" {
		return
	}

	var empresa models.ConfigEmpresa
	if err := database.First(&empresa).Error; err != nil {
		return // no hay empresa todavía; se seedeará cuando se registre la primera
	}

	if empresa.CertPEM != "" && empresa.KeyPEM != "" {
		return // ya tiene certs, no pisar
	}

	updates := map[string]interface{}{
		"cert_pem": cfg.ArcaCertContent,
		"key_pem":  cfg.ArcaKeyContent,
	}
	if cfg.ArcaCUIT != "" && empresa.CUIT == "" {
		updates["cuit"] = cfg.ArcaCUIT
	}
	if cfg.ArcaPuntoVenta > 0 && empresa.PuntoVenta == 1 {
		updates["punto_venta"] = cfg.ArcaPuntoVenta
	}

	if err := database.Model(&empresa).Updates(updates).Error; err != nil {
		slog.Warn("no se pudieron seedear los certs ARCA en la empresa", "err", err)
		return
	}
	slog.Info("certs ARCA seeded en empresa desde env vars", "empresa_id", empresa.ID)
}
